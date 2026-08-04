// ============================================
// BASE DE DATOS EN MEMORIA (PERSISTENTE)
// ============================================

const datos = {
    destinatarios: [],
    tokensEnviados: [],
    configuracion: {
        ultimo_token: '',
        ultimo_token_fecha: '',
        ultimo_envio_fecha: ''
    }
};

let ultimoCorreo = null;

// ============================================
// FUNCIONES
// ============================================

const dbService = {
    // ========== DESTINATARIOS ==========
    getDestinatarios: () => {
        return Promise.resolve(datos.destinatarios.filter(d => d.activo !== 0));
    },

    addDestinatario: (email, nombre = '') => {
        return new Promise((resolve) => {
            const existe = datos.destinatarios.some(d => d.email === email.toLowerCase());
            if (!existe) {
                datos.destinatarios.push({
                    id: Date.now(),
                    email: email.toLowerCase(),
                    nombre: nombre,
                    activo: 1,
                    fecha_creacion: new Date().toISOString()
                });
                console.log(`✅ Correo agregado: ${email}`);
                resolve(true);
            } else {
                console.log(`⚠️ Correo ya existe: ${email}`);
                resolve(false);
            }
        });
    },

    removeDestinatario: (email) => {
        return new Promise((resolve) => {
            const index = datos.destinatarios.findIndex(d => d.email === email.toLowerCase());
            if (index !== -1) {
                datos.destinatarios[index].activo = 0;
                console.log(`✅ Correo eliminado: ${email}`);
                resolve(true);
            } else {
                console.log(`⚠️ Correo no encontrado: ${email}`);
                resolve(false);
            }
        });
    },

    // ========== TOKENS ==========
    saveTokenEnviado: (token, cantidad, mensajeId) => {
        return new Promise((resolve) => {
            const nuevo = {
                id: Date.now(),
                token: token,
                fecha_envio: new Date().toISOString(),
                destinatarios: cantidad,
                mensaje_id: mensajeId
            };
            datos.tokensEnviados.push(nuevo);
            console.log(`✅ Token guardado: ${token}`);
            resolve(nuevo.id);
        });
    },

    getUltimoToken: () => {
        return Promise.resolve(datos.configuracion.ultimo_token || null);
    },

    setUltimoToken: (token) => {
        datos.configuracion.ultimo_token = token;
        datos.configuracion.ultimo_token_fecha = new Date().toISOString();
        console.log(`✅ Token actualizado: ${token}`);
        return Promise.resolve();
    },

    getUltimoEnvio: () => {
        return Promise.resolve(datos.configuracion.ultimo_envio_fecha || null);
    },

    setUltimoEnvio: (fecha) => {
        datos.configuracion.ultimo_envio_fecha = fecha;
        console.log(`✅ Fecha de envío actualizada: ${fecha}`);
        return Promise.resolve();
    },

    // ========== ESTADÍSTICAS ==========
    getEstadisticas: () => {
        const activos = datos.destinatarios.filter(d => d.activo !== 0);
        const ultimoEnvio = datos.tokensEnviados.length > 0 ? 
            datos.tokensEnviados[datos.tokensEnviados.length - 1] : null;
        
        return Promise.resolve({
            total_destinatarios: activos.length,
            total_envios: datos.tokensEnviados.length,
            ultimo_token_enviado: ultimoEnvio ? ultimoEnvio.token : null,
            ultima_fecha_envio: ultimoEnvio ? ultimoEnvio.fecha_envio : null
        });
    },

    // ========== CORREO ==========
    getUltimoCorreo: () => {
        return Promise.resolve(ultimoCorreo);
    },

    setUltimoCorreo: (correo) => {
        ultimoCorreo = correo;
        console.log('📧 Correo guardado:', correo?.subject || 'Sin asunto');
        return Promise.resolve();
    },

    // ========== DEBUG ==========
    getDatos: () => {
        return {
            destinatarios: datos.destinatarios.filter(d => d.activo !== 0),
            tokens: datos.tokensEnviados,
            config: datos.configuracion,
            ultimoCorreo: ultimoCorreo
        };
    }
};

module.exports = dbService;
