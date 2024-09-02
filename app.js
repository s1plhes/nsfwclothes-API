const fastify = require('fastify')({ logger: true });
const dotenv = require('dotenv');
dotenv.config();
const cors = require('@fastify/cors');
const bcrypt = require('bcrypt');
const rateLimit = require('@fastify/rate-limit');

// Registro de MySQL con promesas habilitadas
fastify.register(require('@fastify/mysql'), {
  promise: true,
  connectionLimit: 100,
  queueLimit: 0,
  acquireTimeout: 10000,
  //Using env variables for credentials for security reasons
  connectionString: `mysql://${process.env.DB_USER}:${process.env.DB_PWRD}@${process.env.DB_HOST}/${process.env.DB_NAME}`
});

// Configuración de CORS
fastify.register(cors, {
  origin: (origin, cb) => {
    if (/^localhost$/m.test(origin)) {
      cb(null, false);  // Bloquear CORS desde localhost si es necesario
    } else {
      cb(null, true);   // Permitir CORS para otros orígenes
    }
  }
});

fastify.register(require('@fastify/multipart'));

// Endpoint para enviar un mensaje de WhatsApp
/*fastify.post('/API/OrderWS', async (req, reply) => {
  const { title, price, about, URL } = req.body;
  const messageBody = `Hola, estoy interesado en comprar el producto:
  - Título: ${title}
  - Precio: ${price}
  - Descripción: ${about}
  - URL: ${URL}`;

  try {
    await client.messages
      .create({
        body: messageBody,
        from: 'whatsapp:+14155238886',
        to: 'whatsapp:+584127698781'
      })
      .then(message => {
        reply.send({ message: 'Message sent successfully' });
      });
  } catch (err) {
    reply.code(500).send({ error: 'Error sending message', details: err.message });
  }
});
*/
//Endpoint para crear un objeto en la base de datos
fastify.post('/API/create_product', async (req, reply) => {
  const { title, price, about, image, cat } = req.body;
  try {
    const [result] = await fastify.mysql.query('INSERT INTO products (title, price, about, image, cat) VALUES (?, ?, ?, ?, ?)', [title, price, about, image, cat]);
    reply.send({ success: true, result });
  } catch (err) {
    reply.code(500).send({ error: 'Error creating product', details: err.message });
  }
});

// Endpoint para obtener todos los productos por CAT
fastify.get('/API/:cat', async (req, reply) => {
  try {
    const [rows] = await fastify.mysql.query('SELECT * FROM products WHERE cat = ? ORDER BY id DESC', [req.params.cat]);
    reply.send({ data: rows });
  } catch (err) {
    reply.code(500).send({ error: 'Error fetching T-shirts', details: err.message });
  }
});

// Endpoint para obtener un producto por ID y CAT
fastify.get('/API/:cat/:id', async (req, reply) => {
  try {
    const [rows] = await fastify.mysql.query('SELECT * FROM products WHERE cat = ? AND id = ? ORDER BY id DESC', [req.params.cat, req.params.id]);
    if (rows.length === 0) {
      reply.code(404).send({ error: 'T-shirt not found' });
    } else {
      reply.send(rows[0]);
    }
  } catch (err) {
    reply.code(500).send({ error: 'Error fetching T-shirt', details: err.message });
  }
});

//Endpoint para editar un producto por ID y CAT
fastify.put('/API/:cat/:id', async (req, reply) => {
  const { title, price, about, image } = req.body;

  if (typeof title !== 'string' || typeof price !== 'number' || typeof about !== 'string' || typeof image !== 'string') {
    return reply.code(400).send({ error: 'Invalid input data' });
  }

  try {
    const [rows] = await fastify.mysql.query(
      'UPDATE products SET title = ?, price = ?, about = ?, image = ? WHERE id = ? and cat = ?', 
      [title, price, about, image, req.params.id, req.params.cat]
    );

    if (rows.affectedRows === 0) { 
      reply.code(404).send({ error: 'T-shirt not found' });
    } else {
      reply.send({ message: 'T-shirt updated successfully' });
    }
  } catch (err) {
    reply.code(500).send({ error: 'Error updating T-shirt', details: err.message });
  }
});

// Endpoint para recibir y guardar la calificación según el item y su tipo
fastify.post('/API/rate', async (req, reply) => {
  const { rating, item_id, item_type } = req.body;
  if (!rating || rating < 1 || rating > 5) {
    return reply.code(400).send({ error: 'Invalid rating value' });
  }
  if (!item_id || !item_type || !['tshirt', 'mug'].includes(item_type)) {
    return reply.code(400).send({ error: 'Invalid item ID or type' });
  }
  try {
    const [result] = await fastify.mysql.query(
      'INSERT INTO ratings (item_id, item_type, rating) VALUES (?, ?, ?)',
      [item_id, item_type, rating]
    );
    reply.send({ success: true, result });
  } catch (err) {
    reply.code(500).send({ error: 'Database error', details: err.message });
  }
});

// Endpoint para obtener las estadísticas del rating de un item
fastify.get('/API/rating/:item_type/:item_id', async (req, reply) => {
  const { item_type, item_id } = req.params;

  if (!item_id || !item_type || !['tshirt', 'mug'].includes(item_type)) {
    return reply.code(400).send({ error: 'Invalid item ID or type' });
  }
  try {
    const [rows] = await fastify.mysql.query(
      'SELECT SUM(rating) AS total_rating, COUNT(*) AS rating_count FROM ratings WHERE item_id = ? AND item_type = ?',
      [item_id, item_type]
    );
    const { total_rating, rating_count } = rows[0];
    reply.send({ total_rating: total_rating || 0, rating_count });
  } catch (err) {
    reply.code(500).send({ error: 'Database error', details: err.message });
  }
//Rate Limiter
});
 fastify.register(import('@fastify/rate-limit'), {
  max: 5, // Max 5 requests per minute per IP
  timeWindow: '1 minute'
});


//JWT Setup
fastify.register(require('@fastify/jwt'), {
  secret: 'HyerVonSoxiel'
});


// Endpoint para el login de administrador
fastify.post('/API/admin', async (req, reply) => {
  const { password } = req.body;

  try {
    const [rows] = await fastify.mysql.query('SELECT passwerd FROM adminaccess WHERE id = 1'); // Asumiendo un único registro

    if (rows.length === 0) {
      return reply.code(401).send({ error: 'Unauthorized: Admin access not found', details: err.message });
    }

    const hashedPassword = rows[0].passwerd;
    const isPasswordValid = await bcrypt.compare(password, hashedPassword);

    if (!isPasswordValid) {
      return reply.code(401).send({ error: 'Unauthorized: Password is incorrect', details: err.message });
    }

    const admAccessToken = fastify.jwt.sign({ adminId: 'SiplhesSwallengh' }, { expiresIn: '15m' });
    const refreshToken = fastify.jwt.sign({ adminId: 'SiplhesSwallengh' }, { expiresIn: '7d' });

    return reply.code(200).send({ adminAccessToken: admAccessToken, refreshToken });
  } catch (err) {
    return reply.code(500).send({ error: 'Error fetching admin access', details: err.message });
  }
});


// Endpoint para refrescar el token de acceso
fastify.post('/API/admin/refresh-token', async (req, reply) => {
  const { refreshToken } = req.body;

  try {
    const decoded = fastify.jwt.verify(refreshToken);
    const newAccessToken = fastify.jwt.sign({ adminId: decoded.adminId }, { expiresIn: '15m' });
    return reply.code(200).send({ newAccessToken });
  } catch (err) {
    return reply.code(401).send({ error: 'Invalid refresh token', details: err.message });
  }
});



// Iniciar el servidor
fastify.listen({ port: 3000 }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`server listening on ${fastify.server.address().port}`);
});


