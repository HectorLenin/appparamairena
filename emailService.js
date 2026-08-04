const nodemailer = require('nodemailer');
const { initOAuth2 } = require('./gmail');

function createTransporter() {
    const auth = initOAuth2();
    
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            type: 'OAuth2',
            user: process.env.ADMIN_EMAIL,
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
            accessToken: auth.credentials.access_token
        }
    });
}

// ============================================
// REENVIAR CORREO ORIGINAL (vía Nodemailer)
// ============================================

async function reenviarCorreoOriginal(destinatario, correoOriginal) {
    try {
        console.log(`📧 Reenviando correo original a ${destinatario}...`);
        
        const transporter = createTransporter();
        
        // Usar el contenido HTML original del correo de Netflix
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
        console.error(`❌ Error al reenviar a ${destinatario}:`, error.message);
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
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return resultados;
}

module.exports = {
    createTransporter,
    reenviarCorreoOriginal,
    reenviarTokenMultiple
};
