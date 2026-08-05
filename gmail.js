const { google } = require('googleapis');
const db = require('./database');

// ============================================
// CREAR CLIENTE OAUTH2 PARA UNA CUENTA
// ============================================

function createOAuth2Client(email) {
    const oAuth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'https://developers.google.com/oauthplayground'
    );

    // Si tenemos refresh token guardado, usarlo
    return db.getRefreshToken(email).then(refreshToken => {
        if (refreshToken) {
            oAuth2Client.setCredentials({
                refresh_token: refreshToken
            });
        }
        return oAuth2Client;
    });
}

// ============================================
// GENERAR URL DE AUTORIZACIÓN PARA UN CLIENTE
// ============================================

function getAuthUrl(email) {
    const oAuth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `https://appparamairena-1.onrender.com/api/auth/callback?email=${encodeURIComponent(email)}`
    );

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send'
        ],
        prompt: 'consent'
    });

    return authUrl;
}

// ============================================
// INTERCAMBIAR CÓDIGO POR REFRESH TOKEN
// ============================================

async function exchangeCodeForToken(email, code) {
    try {
        const oAuth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            `https://appparamairena-1.onrender.com/api/auth/callback?email=${encodeURIComponent(email)}`
        );

        const { tokens } = await oAuth2Client.getToken(code);
        
        if (tokens.refresh_token) {
            await db.setRefreshToken(email, tokens.refresh_token);
            console.log(`✅ Refresh token guardado para ${email}`);
        }

        return tokens;
    } catch (error) {
        console.error(`❌ Error al intercambiar código para ${email}:`, error);
        throw error;
    }
}

// ============================================
// LEER CORREO DE NETFLIX PARA UNA CUENTA
// ============================================

async function leerCorreoParaCliente(email) {
    try {
        console.log(`📨 Buscando correo de Netflix para ${email}...`);
        
        // Buscar en la base de datos primero
        const correoGuardado = await db.getUltimoCorreoParaCliente(email);
        if (correoGuardado) {
            // Verificar si el correo es reciente (menos de 24 horas)
            const ahora = new Date();
            const fechaCorreo = new Date(correoGuardado.date);
            const horasDiff = (ahora - fechaCorreo) / (1000 * 60 * 60);
            
            if (horasDiff < 24) {
                console.log(`📧 Usando correo guardado en BD para ${email}`);
                return correoGuardado;
            }
        }

        // Obtener refresh token del cliente
        const refreshToken = await db.getRefreshToken(email);
        if (!refreshToken) {
            console.log(`⚠️ No hay refresh token para ${email}. El cliente debe autorizar la app.`);
            return null;
        }

        const auth = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            'https://developers.google.com/oauthplayground'
        );
        
        auth.setCredentials({
            refresh_token: refreshToken
        });

        const gmail = google.gmail({ version: 'v1', auth });

        const fechaLimite = Math.floor(Date.now() / 1000 - 7 * 24 * 60 * 60);
        const query = `from:netflix.com after:${fechaLimite}`;
        
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

        // Tomar el más reciente
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

        // Guardar en la base de datos
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

module.exports = {
    createOAuth2Client,
    getAuthUrl,
    exchangeCodeForToken,
    leerCorreoParaCliente
};
