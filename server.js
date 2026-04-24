const fastify = require('fastify')({ logger: true });
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

fastify.register(require('@fastify/view'), {
  engine: {
    pug: require('pug'),
  },
  root: path.join(__dirname, 'views'),
});

fastify.register(require('@fastify/formbody'));

// --- База данных SQLite (асинхронная версия) ---
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

// Создаём таблицу
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
  )
`);

// Функции-промисы для работы с БД
function getAllUsers() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM users ORDER BY id ASC', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getUserById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function createUser(name, email) {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO users (name, email) VALUES (?, ?)', [name, email], function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID });
    });
  });
}

function updateUser(id, name, email) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, id], function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
  });
}

function deleteUser(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
  });
}

// --- Роуты ---

// API эндпоинт
fastify.get('/api', async (request, reply) => {
  return { message: 'Запрос прошел успешно' };
});

// Редирект с главной на /users
fastify.get('/', async (request, reply) => {
  reply.redirect('/users');
});

// GET /users - список пользователей
fastify.get('/users', async (request, reply) => {
  const users = await getAllUsers();
  return reply.view('users.pug', { users });
});

// GET /users/create - форма создания
fastify.get('/users/create', async (request, reply) => {
  return reply.view('create.pug');
});

// POST /users - создание
fastify.post('/users', async (request, reply) => {
  const { name, email } = request.body;

  if (!name || !email) {
    return reply.status(400).send('Имя и email обязательны');
  }

  try {
    await createUser(name, email);
    reply.redirect('/users');
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return reply.status(400).send('Пользователь с таким email уже существует');
    }
    console.error(err);
    return reply.status(500).send('Ошибка при создании пользователя');
  }
});

// GET /users/:id/edit - форма редактирования
fastify.get('/users/:id/edit', async (request, reply) => {
  const { id } = request.params;
  const user = await getUserById(id);

  if (!user) {
    return reply.status(404).send('Пользователь не найден');
  }

  return reply.view('edit-user.pug', { user });
});

// POST /users/:id/edit - обновление
fastify.post('/users/:id/edit', async (request, reply) => {
  const { id } = request.params;
  const { name, email } = request.body;

  if (!name || !email) {
    return reply.status(400).send('Имя и email обязательны');
  }

  const existingUser = await getUserById(id);
  if (!existingUser) {
    return reply.status(404).send('Пользователь не найден');
  }

  try {
    await updateUser(id, name, email);
    reply.redirect('/users');
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return reply.status(400).send('Пользователь с таким email уже существует');
    }
    console.error(err);
    return reply.status(500).send('Ошибка при обновлении пользователя');
  }
});

// POST /users/:id/delete - удаление
fastify.post('/users/:id/delete', async (request, reply) => {
  const { id } = request.params;

  const existingUser = await getUserById(id);
  if (!existingUser) {
    return reply.status(404).send('Пользователь не найден');
  }

  await deleteUser(id);
  reply.redirect('/users');
});

// Запуск сервера
const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
    console.log('Сервер запущен на http://localhost:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();