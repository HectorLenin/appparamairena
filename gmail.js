const { google } = require('googleapis');
const db = require('./database');

let oAuth2Client = null;

function initOAuth2() {
    if (!oAuth2Client) {
        oAuth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            'https://developers.google.com/oauthplayground'
        );
        
        oAuth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });
    }
    return oAuth2Client;
}

// ============================================
// LEER CORREO COMPLETO DE NETFLIX
// ============================================

async function leerCorreoCompleto() {
    try {
        console.log('📨 Buscando correo de Netflix...');
        
        const auth = initOAuth2();
        const gmail = google.gmail({ version: 'v1', auth });

        const fechaLimite = Math.floor(Date.now() / 1000 - 7 * 24 * 60 * 60);
        const query = `from:netflix.com after:${fechaLimite}`;
        
        console.log(`🔍 Query: ${query}`);
        
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
        console.log(`📧 Correo encontrado: ${messageId}`);

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

        await db.setUltimoCorreo(correo);

        console.log(`✅ Correo leído: ${subject}`);
        if (token) console.log(`🔑 Token encontrado: ${token}`);

        return correo;

    } catch (error) {
        console.error('❌ Error al leer correo:', error);
        return null;
    }
}

async function hayTokenNuevo() {
    try {
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

module.exports = {
    initOAuth2,
    leerCorreoCompleto,
    hayTokenNuevo
};
