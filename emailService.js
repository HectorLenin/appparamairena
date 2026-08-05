const nodemailer = require('nodemailer');
const { google } = require('googleapis');

// ============================================
// OAUTH2 CON REINTENTOS PARA RENDER
// ============================================

function createTransporter() {
    const oAuth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'https://developers.google.com/oauthplayground'
    );

    oAuth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            type: 'OAuth2',
            user: process.env.ADMIN_EMAIL,
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
            accessToken: oAuth2Client.credentials.access_token
        },
        // Timeouts MÁS LARGOS
        connectionTimeout: 120000,  // 2 minutos
        greetingTimeout: 120000,
        socketTimeout: 120000,
        // Forzar TLS
        tls: {
            rejectUnauthorized: false
        }
    });
}

// ============================================
// REENVIAR CORREO ORIGINAL (CON REINTENTOS)
// ============================================

async function reenviarCorreoOriginal(destinatario, correoOriginal, intento = 1) {
    try {
        console.log(`📧 Reenviando correo original a ${destinatario}... (Intento ${intento})`);
        
        const transporter = createTransporter();
        
        const htmlContent = correoOriginal.cuerpoHTML || correoOriginal.cuerpoTexto || '';

        const mailOptions = {
            from: `"Netflix" <${process.env.ADMIN_EMAIL}>`,
            to: destinatario,
            subject: correoOriginal.subject || 'Token Netflix',
            html: htmlContent,
            text: correoOriginal.cuerpoTexto || 'Contenido no disponible'
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Correo reenviado a ${destinatario} (ID: ${info.messageId})`);
        
        return {
            success: true,
            messageId: info.messageId,
            destinatario: destinatario
        };
    } catch (error) {
        console.error(`❌ Error al reenviar a ${destinatario} (Intento ${intento}):`, error.message);
        
        // Si es timeout o error de conexión, reintentar hasta 3 veces
        if (intento < 3 && (error.message.includes('timeout') || error.message.includes('connection'))) {
            console.log(`🔄 Reintentando envío a ${destinatario} en 5 segundos...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            return reenviarCorreoOriginal(destinatario, correoOriginal, intento + 1);
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
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    return resultados;
}

module.exports = {
    createTransporter,
    reenviarCorreoOriginal,
    reenviarTokenMultiple
};
