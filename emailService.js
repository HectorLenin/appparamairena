const { google } = require('googleapis');

// ============================================
// ENVIAR CORREO CON GMAIL API (HTTPS)
// ============================================

function getGmailClient() {
    const oAuth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'https://developers.google.com/oauthplayground'
    );

    oAuth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    return google.gmail({ version: 'v1', auth: oAuth2Client });
}

// ============================================
// CREAR MENSAJE MIME (para enviar con Gmail API)
// ============================================

function crearMensajeMime(destinatario, asunto, cuerpoHTML, cuerpoTexto) {
    const boundary = '===' + Date.now() + '===';
    
    let mensaje = '';
    mensaje += `To: ${destinatario}\r\n`;
    mensaje += `Subject: ${asunto}\r\n`;
    mensaje += 'MIME-Version: 1.0\r\n';
    mensaje += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n`;
    mensaje += '\r\n';
    
    // Parte texto plano
    mensaje += `--${boundary}\r\n`;
    mensaje += 'Content-Type: text/plain; charset="UTF-8"\r\n';
    mensaje += 'Content-Transfer-Encoding: 7bit\r\n';
    mensaje += '\r\n';
    mensaje += cuerpoTexto || 'Contenido no disponible';
    mensaje += '\r\n';
    
    // Parte HTML
    mensaje += `--${boundary}\r\n`;
    mensaje += 'Content-Type: text/html; charset="UTF-8"\r\n';
    mensaje += 'Content-Transfer-Encoding: 7bit\r\n';
    mensaje += '\r\n';
    mensaje += cuerpoHTML || cuerpoTexto || 'Contenido no disponible';
    mensaje += '\r\n';
    
    mensaje += `--${boundary}--\r\n`;
    
    // Codificar en base64 URL-safe
    const encoded = Buffer.from(mensaje, 'utf-8').toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    
    return encoded;
}

// ============================================
// REENVIAR CORREO ORIGINAL (CON GMAIL API)
// ============================================

async function reenviarCorreoOriginal(destinatario, correoOriginal) {
    try {
        console.log(`📧 Reenviando correo original a ${destinatario}...`);
        
        const gmail = getGmailClient();
        
        // Obtener el cuerpo del correo original
        const cuerpoHTML = correoOriginal.cuerpoHTML || correoOriginal.cuerpoTexto || 'Contenido no disponible';
        const cuerpoTexto = correoOriginal.cuerpoTexto || 'Contenido no disponible';
        const asunto = correoOriginal.subject || 'Token Netflix';
        
        // Crear mensaje MIME
        const mensajeBase64 = crearMensajeMime(
            destinatario,
            asunto,
            cuerpoHTML,
            cuerpoTexto
        );
        
        // Enviar con Gmail API
        const response = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: mensajeBase64
            }
        });
        
        console.log(`✅ Correo reenviado a ${destinatario} (ID: ${response.data.id})`);
        
        return {
            success: true,
            messageId: response.data.id,
            destinatario: destinatario
        };
    } catch (error) {
        console.error(`❌ Error al reenviar a ${destinatario}:`, error.message);
        if (error.response) {
            console.error('Detalles:', error.response.data);
        }
        return {
            success: false,
            error: error.message,
            destinatario: destinatario
        };
    }
}

// ============================================
// REENVIAR A MÚLTIPLES DESTINATARIOS
// ============================================

async function reenviarTokenMultiple(destinatarios, correoOriginal) {
    const resultados = [];
    
    for (const destinatario of destinatarios) {
        const resultado = await reenviarCorreoOriginal(destinatario, correoOriginal);
        resultados.push(resultado);
        // Esperar 2 segundos entre envíos
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return resultados;
}

module.exports = {
    getGmailClient,
    crearMensajeMime,
    reenviarCorreoOriginal,
    reenviarTokenMultiple
};
