const fastify = require('fastify')({ logger: true });
const dotenv = require('dotenv');
dotenv.config();
const cors = require('@fastify/cors');
const bcrypt = require('bcrypt');
const rateLimit = require('@fastify/rate-limit');

fastify.register(require('@fastify/mysql'), {
  promise: true,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

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

fastify.post('/API/create_product', async (req, reply) => {
  const { title, price, about, image, cat } = req.body;
  try {
    const [result] = await fastify.mysql.query('INSERT INTO products (title, price, about, image, cat) VALUES (?, ?, ?, ?, ?)', [title, price, about, image, cat]);
    reply.send({ success: true, result });
  } catch (err) {
    reply.code(500).send({ error: 'Error creating product', details: err.message });
  }
});

fastify.get('/API/products', async (req, reply) => {
  try {
    const [rows] = await fastify.mysql.query('SELECT title,price,image,cat,id FROM products ORDER BY RAND() DESC LIMIT 6');
    reply.send({ data: rows });
  } catch (err) {
    reply.code(500).send({ error: 'Error fetching T-shirts', details: err.message });
  }
});

fastify.get('/API/:cat', async (req, reply) => {
  try {
    const [rows] = await fastify.mysql.query('SELECT * FROM products WHERE cat = ? ORDER BY id DESC', [req.params.cat]);
    reply.send({ data: rows });
  } catch (err) {
    reply.code(500).send({ error: 'Error fetching T-shirts', details: err.message });
  }
});

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

fastify.put('/API/:cat/:id', async (req, reply) => {
  const { title, price, about, image } = req.body;

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
});

fastify.register(import('@fastify/rate-limit'), {
  max: 5, // Max 5 requests per minute per IP
  timeWindow: '1 minute'
});

fastify.register(require('@fastify/jwt'), {
  secret: process.env.SECRET_KEY
});

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

    const admAccessToken = fastify.jwt.sign({ adminId: process.env.SECRET_KEY }, { expiresIn: '15m' });
    const refreshToken = fastify.jwt.sign({ adminId: process.env.SECRET_KEY }, { expiresIn: '7d' });

    return reply.code(200).send({ adminAccessToken: admAccessToken, refreshToken });
  } catch (err) {
    return reply.code(500).send({ error: 'Error fetching admin access', details: err.message });
  }
});

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

fastify.listen({ port: process.env.APP_PORT || 4000, host: '0.0.0.0' }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`server listening on ${fastify.server.address().port}`);
});


