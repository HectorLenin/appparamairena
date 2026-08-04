const nodemailer = require('nodemailer');
const { initOAuth2 } = require('./gmail');

function createTransporter() {
    try {
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
    } catch (error) {
        console.error('❌ Error al crear transporter:', error);
        throw error;
    }
}

function createEmailTemplate(token, destinatario, fecha) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f7fa; }
                .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #e50914, #b20710); padding: 30px 20px; text-align: center; }
                .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
                .header p { color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px; }
                .content { padding: 30px 25px; }
                .token-box { background: #f8f9fc; border: 2px dashed #e50914; border-radius: 12px; padding: 20px; margin: 25px 0; text-align: center; }
                .token-box .label { font-size: 14px; color: #888; margin: 0 0 8px; }
                .token-box .token { font-size: 32px; font-weight: 700; color: #e50914; letter-spacing: 3px; margin: 0; font-family: 'Courier New', monospace; }
                .info { background: #f0f7ff; border-radius: 8px; padding: 15px; margin: 20px 0; }
                .info p { margin: 0; color: #666; font-size: 13px; }
                .footer { background: #f5f7fa; padding: 20px 25px; border-top: 1px solid #e8ecf0; text-align: center; }
                .footer p { margin: 0; color: #888; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔑 Token Netflix</h1>
                    <p>Reenvío automático desde el correo administrador</p>
                </div>
                <div class="content">
                    <p>Hola <strong>${destinatario}</strong>,</p>
                    <p>Te reenviamos el token de Netflix que recibimos en el correo administrador.</p>
                    
                    <div class="token-box">
                        <p class="label">🔑 Tu código de acceso</p>
                        <p class="token">${token}</p>
                    </div>
                    
                    <div class="info">
                        <p><strong>📅 Fecha de reenvío:</strong> ${new Date(fecha).toLocaleString()}</p>
                        <p><strong>📩 Fuente:</strong> Correo administrador</p>
                    </div>
                    
                    <p style="font-size: 14px; color: #666; margin-top: 20px;">
                        ⚠️ Este es un reenvío automático. Por favor, no respondas a este correo.
                    </p>
                </div>
                <div class="footer">
                    <p>Sistema automático de reenvío de tokens Netflix</p>
                    <p style="margin-top: 5px; color: #aaa; font-size: 11px;">
                        © ${new Date().getFullYear()} - Reenvío cada ${process.env.CYCLE_DAYS || 20} días
                    </p>
                </div>
            </div>
        </body>
        </html>
    `;
}

async function reenviarToken(destinatario, token, fecha) {
    try {
        console.log(`📧 Enviando a ${destinatario}...`);
        const transporter = createTransporter();
        
        const mailOptions = {
            from: `"Reenvío Netflix" <${process.env.ADMIN_EMAIL}>`,
            to: destinatario,
            subject: `🔑 Token Netflix - ${new Date().toLocaleDateString()}`,
            html: createEmailTemplate(token, destinatario, fecha),
            text: `Token Netflix: ${token}\n\nReenvío automático desde el correo administrador.`
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Enviado a ${destinatario} (ID: ${info.messageId})`);
        
        return {
            success: true,
            messageId: info.messageId,
            destinatario: destinatario
        };
    } catch (error) {
        console.error(`❌ Error al enviar a ${destinatario}:`, error.message);
        return {
            success: false,
            error: error.message,
            destinatario: destinatario
        };
    }
}

async function reenviarTokenMultiple(destinatarios, token, fecha) {
    console.log(`📨 Enviando a ${destinatarios.length} destinatarios...`);
    const resultados = [];
    
    for (const destinatario of destinatarios) {
        const resultado = await reenviarToken(destinatario, token, fecha);
        resultados.push(resultado);
        
        // Pausa entre envíos para evitar límites
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const exitosos = resultados.filter(r => r.success);
    console.log(`✅ Envíos completados: ${exitosos.length}/${resultados.length}`);
    
    return resultados;
}

module.exports = {
    createTransporter,
    reenviarToken,
    reenviarTokenMultiple,
    createEmailTemplate
};