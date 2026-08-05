// ============================================
// ACTUALIZAR CORREO EN TIEMPO REAL
// ============================================

app.post('/api/correo/actualizar', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email requerido' });
        }

        console.log(`🔄 Actualizando correo en tiempo real para ${email}...`);
        const correo = await gmail.leerCorreoParaCliente(email);
        
        if (correo) {
            await db.setUltimoCorreoParaCliente(email, correo);
            res.json({ 
                success: true, 
                message: 'Correo actualizado',
                correo: correo
            });
        } else {
            res.json({ 
                success: false, 
                message: 'No se encontraron correos nuevos',
                correo: null
            });
        }
    } catch (error) {
        console.error('Error en /api/correo/actualizar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
