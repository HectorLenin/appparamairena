// ============================================
// OBTENER URL DE AUTORIZACIÓN PARA UN CLIENTE
// ============================================

app.get('/api/auth/url', (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email requerido' });
        }

        const authUrl = gmail.getAuthUrl(email);
        res.json({ success: true, url: authUrl });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// CALLBACK DE AUTORIZACIÓN
// ============================================

app.get('/api/auth/callback', async (req, res) => {
    try {
        const { code, email } = req.query;
        if (!code || !email) {
            return res.status(400).send('Faltan parámetros');
        }

        await gmail.exchangeCodeForToken(email, code);
        res.send(`
            <html>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h2>✅ ¡Autorización exitosa!</h2>
                    <p>La cuenta <strong>${email}</strong> ha sido autorizada correctamente.</p>
                    <p>Ya puedes cerrar esta ventana y volver a la aplicación.</p>
                    <a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #e50914; color: white; text-decoration: none; border-radius: 8px;">Volver a la app</a>
                </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send(`<h2>❌ Error: ${error.message}</h2>`);
    }
});

// ============================================
// OBTENER ÚLTIMO CORREO DE UN CLIENTE
// ============================================

app.get('/api/correo/cliente', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email requerido' });
        }

        const correo = await gmail.leerCorreoParaCliente(email);
        res.json({ success: true, correo: correo || null });
    } catch (error) {
        console.error('Error en /api/correo/cliente:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
