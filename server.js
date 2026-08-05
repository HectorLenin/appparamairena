const { google } = require('googleapis');
const db = require('./database');

// ============================================
// GENERAR URL DE AUTORIZACIÓN PARA UN CLIENTE
// ============================================

function getAuthUrl(email) {
    const oAuth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'https://appparamairena-1.onrender.com/api/auth/callback'
    );

    const state = Buffer.from(JSON.stringify({ email })).toString('base64');

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send'
        ],
        prompt: 'consent',
        state: state
    });

    return authUrl;
}

// ============================================
// INTERCAMBIAR CÓDIGO POR REFRESH TOKEN
// ============================================

async function exchangeCodeForToken(email, code) {
    try {
        console.log(`🔄 Intercambiando código por token para ${email}...`);
        
        const oAuth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            'https://appparamairena-1.onrender.com/api/auth/callback'
        );

        const { tokens } = await oAuth2Client.getToken(code);
        console.log('✅ Tokens recibidos:', tokens ? 'Sí' : 'No');
        
        if (tokens.refresh_token) {
            await db.setRefreshToken(email, tokens.refresh_token);
            console.log(`✅ Refresh token guardado para ${email}`);
        } else {
            console.log(`⚠️ No se recibió refresh_token para ${email}`);
        }

        return tokens;
    } catch (error) {
        console.error(`❌ Error al intercambiar código para ${email}:`, error);
        throw error;
    }
}

// ============================================
// LEER CORREO DE NETFLIX (GLOBAL - ADMIN)
// ============================================

async function leerCorreoCompleto() {
    try {
        console.log('📨 Buscando correo de Netflix (admin)...');
        
        const auth = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            'https://developers.google.com/oauthplayground'
        );
        
        auth.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });

        const gmail = google.gmail({ version: 'v1', auth });

        // 🔥 BUSCAR EN LOS ÚLTIMOS 7 DÍAS
        const fechaLimite = Math.floor(Date.now() / 1000 - 7 * 24 * 60 * 60);
        const query = `from:netflix.com after:${fechaLimite}`;
        
        const response = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 1
        });

        const messages = response.data.messages || [];
        
        if (messages.length === 0) {
            console.log('ℹ️ No se encontraron correos de Netflix');
            return null;
        }

        const messageId = messages[0].id;
        const messageData = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
        });

        let cuerpoHTML = '';
        let cuerpoTexto = '';

        const parts = messageData.data.payload?.parts || [];
        
        function procesarParte(parte) {
            if (parte.mimeType === 'text/html' && parte.body?.data) {
                cuerpoHTML = Buffer.from(parte.body.data, 'base64').toString('utf-8');
            }
            if (parte.mimeType === 'text/plain' && parte.body?.data) {
                cuerpoTexto = Buffer.from(parte.body.data, 'base64').toString('utf-8');
            }
            if (parte.parts) {
                parte.parts.forEach(p => procesarParte(p));
            }
        }

        if (parts.length > 0) {
            parts.forEach(part => procesarParte(part));
        } else if (messageData.data.payload?.body?.data) {
            const data = messageData.data.payload.body.data;
            if (messageData.data.payload.mimeType === 'text/html') {
                cuerpoHTML = Buffer.from(data, 'base64').toString('utf-8');
            } else {
                cuerpoTexto = Buffer.from(data, 'base64').toString('utf-8');
            }
        }

        if (!cuerpoHTML && cuerpoTexto) {
            cuerpoHTML = cuerpoTexto.replace(/\n/g, '<br>');
        }

        const tokenRegex = /NF-[A-Z0-9]{4}-[A-Z0-9]{4}/i;
        const match = cuerpoHTML.match(tokenRegex) || cuerpoTexto.match(tokenRegex);
        const token = match ? match[0].toUpperCase() : null;

        const headers = messageData.data.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || 'Sin asunto';
        const from = headers.find(h => h.name === 'From')?.value || 'Netflix';

        const correo = {
            id: messageId,
            subject: subject,
            from: from,
            cuerpoHTML: cuerpoHTML,
            cuerpoTexto: cuerpoTexto,
            token: token,
            date: new Date(parseInt(messageData.data.internalDate)),
            snippet: messageData.data.snippet || ''
        };

        console.log(`✅ Correo leído: ${subject}`);
        if (token) console.log(`🔑 Token encontrado: ${token}`);

        return correo;

    } catch (error) {
        console.error('❌ Error al leer correo:', error);
        return null;
    }
}

// ============================================
// LEER CORREO PARA UN CLIENTE ESPECÍFICO (EN TIEMPO REAL)
// ============================================

async function leerCorreoParaCliente(email) {
    try {
        console.log(`📨 Buscando correo de Netflix para ${email}...`);
        
        // Obtener refresh token del cliente
        let refreshToken = await db.getRefreshToken(email);
        
        // Si es el admin y no tiene token, usar el token global del admin
        if (!refreshToken && email === process.env.ADMIN_EMAIL) {
            console.log(`🔑 Usando token global del admin para ${email}`);
            refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
        }

        if (!refreshToken) {
            console.log(`⚠️ No hay refresh token para ${email}. El cliente debe autorizar la app.`);
            return null;
        }

        // Usar ESE token para leer su correo
        const auth = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            'https://developers.google.com/oauthplayground'
        );
        
        auth.setCredentials({
            refresh_token: refreshToken
        });

        const gmail = google.gmail({ version: 'v1', auth });

        // 🔥 BUSCAR EN LOS ÚLTIMOS 7 DÍAS
        const fechaLimite = Math.floor(Date.now() / 1000 - 7 * 24 * 60 * 60);
        const query = `from:netflix.com after:${fechaLimite}`;
        
        console.log(`🔍 Query para ${email}: ${query}`);
        
        const response = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 5
        });

        const messages = response.data.messages || [];
        
        if (messages.length === 0) {
            console.log(`ℹ️ No se encontraron correos de Netflix para ${email}`);
            return null;
        }

        const messageId = messages[0].id;
        console.log(`📧 Mensaje encontrado para ${email}: ${messageId}`);
        
        const messageData = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
        });

        let cuerpoHTML = '';
        let cuerpoTexto = '';

        const parts = messageData.data.payload?.parts || [];
        
        function procesarParte(parte) {
            if (parte.mimeType === 'text/html' && parte.body?.data) {
                cuerpoHTML = Buffer.from(parte.body.data, 'base64').toString('utf-8');
            }
            if (parte.mimeType === 'text/plain' && parte.body?.data) {
                cuerpoTexto = Buffer.from(parte.body.data, 'base64').toString('utf-8');
            }
            if (parte.parts) {
                parte.parts.forEach(p => procesarParte(p));
            }
        }

        if (parts.length > 0) {
            parts.forEach(part => procesarParte(part));
        } else if (messageData.data.payload?.body?.data) {
            const data = messageData.data.payload.body.data;
            if (messageData.data.payload.mimeType === 'text/html') {
                cuerpoHTML = Buffer.from(data, 'base64').toString('utf-8');
            } else {
                cuerpoTexto = Buffer.from(data, 'base64').toString('utf-8');
            }
        }

        if (!cuerpoHTML && cuerpoTexto) {
            cuerpoHTML = cuerpoTexto.replace(/\n/g, '<br>');
        }

        const tokenRegex = /NF-[A-Z0-9]{4}-[A-Z0-9]{4}/i;
        const match = cuerpoHTML.match(tokenRegex) || cuerpoTexto.match(tokenRegex);
        const token = match ? match[0].toUpperCase() : null;

        const headers = messageData.data.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || 'Sin asunto';
        const from = headers.find(h => h.name === 'From')?.value || 'Netflix';

        const correo = {
            id: messageId,
            subject: subject,
            from: from,
            cuerpoHTML: cuerpoHTML,
            cuerpoTexto: cuerpoTexto,
            token: token,
            date: new Date(parseInt(messageData.data.internalDate)),
            snippet: messageData.data.snippet || ''
        };

        // Guardar en la base de datos (actualizar siempre)
        await db.setUltimoCorreoParaCliente(email, correo);
        if (token) {
            await db.setUltimoToken(token);
        }

        console.log(`✅ Correo leído para ${email}: ${subject}`);
        return correo;

    } catch (error) {
        console.error(`❌ Error al leer correo para ${email}:`, error);
        return null;
    }
}

// ============================================
// VERIFICAR SI HAY TOKEN NUEVO (para el cron)
// ============================================

async function hayTokenNuevo() {
    try {
        console.log('🔍 Verificando si hay token nuevo...');
        const correo = await leerCorreoCompleto();
        if (!correo) return null;

        const ultimoToken = await db.getUltimoToken();
        if (ultimoToken && ultimoToken === correo.token) {
            console.log('ℹ️ Token ya fue procesado anteriormente');
            return null;
        }

        return correo;
    } catch (error) {
        console.error('❌ Error al verificar token nuevo:', error);
        return null;
    }
}

// ============================================
// EXPORTAR
// ============================================

module.exports = {
    getAuthUrl,
    exchangeCodeForToken,
    leerCorreoCompleto,
    leerCorreoParaCliente,
    hayTokenNuevo
};
