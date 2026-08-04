const nodemailer = require('nodemailer');
const { initOAuth2 } = require('./gmail');
const db = require('./database');

// Crear transporter
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

// Plantilla de correo
function createEmailTemplate(token, destinatario, fecha) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f7fa;">
      <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #e50914, #b20710); padding: 30px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">
            <i class="fas fa-ticket-alt" style="margin-right: 10px;"></i>Token Netflix
          </h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">
            Reenvío automático desde el correo administrador
          </p>
        </div>
        
        <!-- Content -->
        <div style="padding: 30px 25px;">
          <p style="font-size: 16px; color: #333; line-height: 1.6;">
            Hola <strong>${destinatario}</strong>,
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Te reenviamos el token de Netflix que recibimos en el correo administrador.
          </p>
          
          <!-- Token Box -->
          <div style="background: #f8f9fc; border: 2px dashed #e50914; border-radius: 12px; padding: 20px; margin: 25px 0; text-align: center;">
            <p style="font-size: 14px; color: #888; margin: 0 0 8px;">🔑 Tu código de acceso</p>
            <p style="font-size: 32px; font-weight: 700; color: #e50914; letter-spacing: 3px; margin: 0; font-family: 'Courier New', monospace;">
              ${token}
            </p>
          </div>
          
          <div style="background: #f0f7ff; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #666; font-size: 13px;">
              <strong>📅 Fecha de reenvío:</strong> ${new Date(fecha).toLocaleString()}
            </p>
            <p style="margin: 5px 0 0; color: #666; font-size: 13px;">
              <strong>📩 Fuente:</strong> Correo administrador
            </p>
          </div>
          
          <p style="font-size: 14px; color: #666; line-height: 1.6; margin-top: 20px;">
            ⚠️ Este es un reenvío automático. Por favor, no respondas a este correo.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="background: #f5f7fa; padding: 20px 25px; border-top: 1px solid #e8ecf0; text-align: center;">
          <p style="margin: 0; color: #888; font-size: 12px;">
            Sistema automático de reenvío de tokens Netflix
          </p>
          <p style="margin: 5px 0 0; color: #aaa; font-size: 11px;">
            © ${new Date().getFullYear()} - Reenvío cada 20 días
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Reenviar token a un destinatario
async function reenviarToken(destinatario, token, fecha) {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"Reenvío Netflix" <${process.env.ADMIN_EMAIL}>`,
      to: destinatario,
      subject: `🔑 Token Netflix - ${new Date().toLocaleDateString()}`,
      html: createEmailTemplate(token, destinatario, fecha),
      text: `Token Netflix: ${token}\n\nReenvío automático desde el correo administrador.`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Token enviado a ${destinatario} (ID: ${info.messageId})`);
    
    return {
      success: true,
      messageId: info.messageId,
      destinatario: destinatario
    };
  } catch (error) {
    console.error(`❌ Error al enviar a ${destinatario}:`, error);
    return {
      success: false,
      error: error.message,
      destinatario: destinatario
    };
  }
}

// Reenviar token a múltiples destinatarios
async function reenviarTokenMultiple(destinatarios, token, fecha) {
  const resultados = [];
  
  for (const destinatario of destinatarios) {
    const resultado = await reenviarToken(destinatario, token, fecha);
    resultados.push(resultado);
    
    // Pequeña pausa entre envíos para evitar límites
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return resultados;
}

module.exports = {
  createTransporter,
  reenviarToken,
  reenviarTokenMultiple,
  createEmailTemplate
};