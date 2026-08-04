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

        // Buscar el correo más reciente de Netflix (últimos 7 días)
        const fechaLimite = Math.floor(Date.now() / 1000 - 7 * 24 * 60 * 60);
        const query = `from:netflix.com after:${fechaLimite}`;
        
        const response = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 1  // Solo el más reciente
        });

        const messages = response.data.messages || [];
        
        if (messages.length === 0) {
            console.log('ℹ️ No se encontraron correos de Netflix');
            return null;
        }

        const messageId = messages[0].id;
        console.log(`📧 Correo encontrado: ${messageId}`);

        // Obtener el correo COMPLETO (incluyendo cuerpo y adjuntos)
        const messageData = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
        });

        // Extraer el cuerpo del correo
        let cuerpoHTML = '';
        let cuerpoTexto = '';
        let attachments = [];

        const parts = messageData.data.payload?.parts || [];
        
        // Función recursiva para extraer contenido de partes anidadas
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

        // Procesar todas las partes
        if (parts.length > 0) {
            parts.forEach(part => procesarParte(part));
        } else if (messageData.data.payload?.body?.data) {
            // Si no hay partes, usar el cuerpo directamente
            const data = messageData.data.payload.body.data;
            if (messageData.data.payload.mimeType === 'text/html') {
                cuerpoHTML = Buffer.from(data, 'base64').toString('utf-8');
            } else {
                cuerpoTexto = Buffer.from(data, 'base64').toString('utf-8');
            }
        }

        // Si no hay HTML, usar texto plano
        if (!cuerpoHTML && cuerpoTexto) {
            cuerpoHTML = cuerpoTexto.replace(/\n/g, '<br>');
        }

        // Extraer el token (si existe) para guardarlo
        const tokenRegex = /NF-[A-Z0-9]{4}-[A-Z0-9]{4}/i;
        const match = cuerpoHTML.match(tokenRegex) || cuerpoTexto.match(tokenRegex);
        const token = match ? match[0].toUpperCase() : null;

        // Obtener asunto y remitente
        const headers = messageData.data.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || 'Sin asunto';
        const from = headers.find(h => h.name === 'From')?.value || 'Netflix';

        console.log(`✅ Correo leído: ${subject}`);
        if (token) console.log(`🔑 Token encontrado: ${token}`);

        return {
            id: messageId,
            subject: subject,
            from: from,
            cuerpoHTML: cuerpoHTML,
            cuerpoTexto: cuerpoTexto,
            token: token,
            date: new Date(parseInt(messageData.data.internalDate)),
            snippet: messageData.data.snippet || ''
        };

    } catch (error) {
        console.error('❌ Error al leer correo:', error);
        return null;
    }
}

// ============================================
// REENVIAR CORREO ORIGINAL
// ============================================

async function reenviarCorreoOriginal(destinatario, correoOriginal) {
    try {
        console.log(`📧 Reenviando correo original a ${destinatario}...`);
        
        const auth = initOAuth2();
        const gmail = google.gmail({ version: 'v1', auth });

        // Obtener el mensaje original completo
        const messageData = await gmail.users.messages.get({
            userId: 'me',
            id: correoOriginal.id,
            format: 'raw'
        });

        // Extraer el RAW del mensaje original
        const raw = messageData.data.raw;
        
        // Decodificar el raw para modificarlo (cambiar el "To")
        const decodedRaw = Buffer.from(raw, 'base64').toString('utf-8');
        
        // Reemplazar el "To" original con el destinatario
        // Mantenemos el resto del correo intacto (asunto, cuerpo, etc.)
        const lines = decodedRaw.split('\n');
        let nuevoRaw = '';
        let toReemplazado = false;
        
        for (const line of lines) {
            if (line.startsWith('To:') && !toReemplazado) {
                nuevoRaw += `To: ${destinatario}\n`;
                toReemplazado = true;
            } else if (line.startsWith('To:') && toReemplazado) {
                // Saltar líneas To adicionales
                continue;
            } else {
                nuevoRaw += line + '\n';
            }
        }

        // Si no se reemplazó el To, agregarlo
        if (!toReemplazado) {
            nuevoRaw = `To: ${destinatario}\n${nuevoRaw}`;
        }

        // Codificar de nuevo a base64
        const newRawBase64 = Buffer.from(nuevoRaw, 'utf-8').toString('base64');

        // Enviar el correo modificado
        const result = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: newRawBase64
            }
        });

        console.log(`✅ Correo reenviado a ${destinatario} (ID: ${result.data.id})`);
        
        return {
            success: true,
            messageId: result.data.id,
            destinatario: destinatario
        };

    } catch (error) {
        console.error(`❌ Error al reenviar a ${destinatario}:`, error.message);
        return {
            success: false,
            error: error.message,
            destinatario: destinatario
        };
    }
}

// ============================================
// FUNCIONES EXISTENTES (para compatibilidad)
// ============================================

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
    reenviarCorreoOriginal,
    hayTokenNuevo
};
