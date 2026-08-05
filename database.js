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
    },
    refreshTokensPorCliente: {},
    ultimoCorreoPorCliente: {}
};

let ultimoCorreo = null;

// ============================================
// FUNCIONES
// ============================================

const dbService = {
    // ========== DESTINATARIOS / USUARIOS ==========
    getDestinatarios: () => {
        return Promise.resolve(datos.destinatarios.filter(d => d.activo !== 0));
    },

    // ✅ NUEVO: Obtener solo usuarios con permisos
    getUsuarios: () => {
        return Promise.resolve(datos.destinatarios.filter(d => d.activo !== 0 && d.esUsuario !== false));
    },

    // ✅ MODIFICADO: Agregar con permiso de usuario
    addDestinatario: (email, nombre = '', esUsuario = true) => {
        return new Promise((resolve) => {
            const existe = datos.destinatarios.some(d => d.email === email.toLowerCase());
            if (!existe) {
                datos.destinatarios.push({
                    id: Date.now(),
                    email: email.toLowerCase(),
                    nombre: nombre,
                    esUsuario: esUsuario,  // ✅ NUEVO CAMPO
                    activo: 1,
                    fecha_creacion: new Date().toISOString()
                });
                console.log(`✅ Usuario agregado: ${email} (permisos: ${esUsuario ? 'usuario' : 'solo destinatario'})`);
                resolve(true);
            } else {
                console.log(`⚠️ El usuario ya existe: ${email}`);
                resolve(false);
            }
        });
    },

    removeDestinatario: (email) => {
        return new Promise((resolve) => {
            const index = datos.destinatarios.findIndex(d => d.email === email.toLowerCase());
            if (index !== -1) {
                datos.destinatarios[index].activo = 0;
                console.log(`✅ Usuario eliminado: ${email}`);
                resolve(true);
            } else {
                console.log(`⚠️ Usuario no encontrado: ${email}`);
                resolve(false);
            }
        });
    },

    // ========== TOKENS DE CLIENTES ==========
    setRefreshToken: (email, refreshToken) => {
        const key = email.toLowerCase();
        datos.refreshTokensPorCliente[key] = refreshToken;
        console.log(`✅ Refresh token guardado para ${email}`);
        return Promise.resolve();
    },

    getRefreshToken: (email) => {
        const key = email.toLowerCase();
        return Promise.resolve(datos.refreshTokensPorCliente[key] || null);
    },

    // ========== CORREOS DE CLIENTES ==========
    setUltimoCorreoParaCliente: (email, correo) => {
        const key = email.toLowerCase();
        datos.ultimoCorreoPorCliente[key] = correo;
        console.log(`📧 Correo guardado para ${email}: ${correo.subject}`);
        return Promise.resolve();
    },

    getUltimoCorreoParaCliente: (email) => {
        const key = email.toLowerCase();
        return Promise.resolve(datos.ultimoCorreoPorCliente[key] || null);
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
            total_usuarios: activos.filter(d => d.esUsuario !== false).length,
            total_envios: datos.tokensEnviados.length,
            ultimo_token_enviado: ultimoEnvio ? ultimoEnvio.token : null,
            ultima_fecha_envio: ultimoEnvio ? ultimoEnvio.fecha_envio : null
        });
    },

    // ========== CORREO GLOBAL ==========
    getUltimoCorreo: () => {
        return Promise.resolve(ultimoCorreo);
    },

    setUltimoCorreo: (correo) => {
        ultimoCorreo = correo;
        console.log('📧 Correo global guardado:', correo?.subject || 'Sin asunto');
        return Promise.resolve();
    },

    // ========== DEBUG ==========
    getDatos: () => {
        return {
            destinatarios: datos.destinatarios.filter(d => d.activo !== 0),
            tokens: datos.tokensEnviados,
            config: datos.configuracion,
            ultimoCorreo: ultimoCorreo,
            refreshTokensPorCliente: datos.refreshTokensPorCliente,
            ultimoCorreoPorCliente: datos.ultimoCorreoPorCliente
        };
    }
};

module.exports = dbService;
