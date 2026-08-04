const { google } = require('googleapis');
const db = require('./database');

let oAuth2Client = null;

function initOAuth2() {
    if (!oAuth2Client) {
        console.log('🔑 Inicializando OAuth2...');
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

async function leerTokensDeGmail() {
    try {
        console.log('📨 Buscando correos de Netflix...');
        
        const auth = initOAuth2();
        const gmail = google.gmail({ version: 'v1', auth });

        // Buscar correos de Netflix (últimos 7 días)
        const fechaLimite = Math.floor(Date.now() / 1000 - 7 * 24 * 60 * 60);
        const query = `from:netflix.com after:${fechaLimite}`;
        
        console.log('🔍 Query:', query);
        
        const response = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 10
        });

        const messages = response.data.messages || [];
        
        if (messages.length === 0) {
            console.log('ℹ️ No se encontraron correos de Netflix');
            return null;
        }

        console.log(`📧 Encontrados ${messages.length} correos de Netflix`);

        // Obtener el correo más reciente
        const lastMessage = messages[0];
        const messageData = await gmail.users.messages.get({
            userId: 'me',
            id: lastMessage.id,
            format: 'full'
        });

        // Extraer cuerpo del correo
        let cuerpo = '';
        const parts = messageData.data.payload?.parts || [];
        
        for (const part of parts) {
            if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
                if (part.body?.data) {
                    const data = Buffer.from(part.body.data, 'base64').toString('utf-8');
                    cuerpo += data;
                }
            }
        }

        if (!cuerpo) {
            cuerpo = messageData.data.snippet || '';
        }

        // Buscar token con regex
        const tokenRegex = /NF-[A-Z0-9]{4}-[A-Z0-9]{4}/i;
        const match = cuerpo.match(tokenRegex);

        if (match) {
            const token = match[0].toUpperCase();
            console.log(`✅ Token encontrado: ${token}`);
            
            await db.setUltimoToken(token);
            
            return {
                token: token,
                messageId: lastMessage.id,
                date: new Date(parseInt(lastMessage.internalDate)),
                subject: messageData.data.payload?.headers?.find(h => h.name === 'Subject')?.value || 'Sin asunto',
                from: messageData.data.payload?.headers?.find(h => h.name === 'From')?.value || '',
                snippet: messageData.data.snippet || ''
            };
        }

        console.log('⚠️ No se encontró token en el correo');
        return null;
    } catch (error) {
        console.error('❌ Error al leer correos:', error);
        return null;
    }
}

async function hayTokenNuevo() {
    try {
        console.log('🔍 Verificando si hay token nuevo...');
        const tokenData = await leerTokensDeGmail();
        if (!tokenData) return null;

        const ultimoToken = await db.getUltimoToken();
        if (ultimoToken && ultimoToken === tokenData.token) {
            console.log('ℹ️ Token ya fue procesado anteriormente');
            return null;
        }

        console.log('✅ Token nuevo detectado:', tokenData.token);
        return tokenData;
    } catch (error) {
        console.error('❌ Error al verificar token nuevo:', error);
        return null;
    }
}

module.exports = {
    initOAuth2,
    leerTokensDeGmail,
    hayTokenNuevo
};