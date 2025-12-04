import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRoutes from '../routes/auth.js';

// Mock semua dependencies
vi.mock('../supabaseClient.js', () => ({
  supabase: {
    from: vi.fn()
  }
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn()
  }
}));

vi.mock('../utils/helpers.js', () => ({
  generateToken: vi.fn(),
  generateId: vi.fn(),
  validateEmail: vi.fn(),
  validatePassword: vi.fn(),
  validateName: vi.fn()
}));

import { supabase } from '../supabaseClient.js';
import bcrypt from 'bcrypt';
import { generateToken, generateId, validateEmail, validatePassword, validateName } from '../utils/helpers.js';

describe('POST /register', () => {
  let app;
  let mockSelect;
  let mockInsert;
  let mockFrom;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/', authRoutes);

    vi.clearAllMocks();

    // Setup mock chain untuk supabase
    mockSelect = vi.fn();
    mockInsert = vi.fn();
    mockFrom = vi.fn();
    supabase.from = mockFrom;

    // Default mock values
    validateEmail.mockReturnValue(true);
    validatePassword.mockReturnValue({ isValid: true });
    validateName.mockReturnValue(true);
    generateId.mockReturnValue('user_123');
    generateToken.mockReturnValue('mock_token_123');
    bcrypt.hash.mockResolvedValue('hashed_password');
  });

  it('harus berhasil mendaftar user baru', async () => {
    // Mock untuk cek user tidak ada
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' } // User tidak ditemukan
          })
        })
      })
    });

    // Mock untuk insert user baru
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              user_id: 'user_123',
              name: 'John Doe',
              email: 'john@example.com'
            },
            error: null
          })
        })
      })
    });

    const response = await request(app)
      .post('/register')
      .send({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123!'
      });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('User registered successfully');
    expect(response.body.user).toEqual({
      user_id: 'user_123',
      name: 'John Doe',
      email: 'john@example.com'
    });
    expect(response.body.token).toBe('mock_token_123');
  });

  it('harus menolak jika field tidak lengkap', async () => {
    const response = await request(app)
      .post('/register')
      .send({
        name: 'John Doe',
        email: 'john@example.com'
        // password tidak dikirim
      });

    expect(response.text).toBe('Name, email, and password are required');
  });

  it('harus menolak jika email tidak valid', async () => {
    validateEmail.mockReturnValue(false);

    const response = await request(app)
      .post('/register')
      .send({
        name: 'John Doe',
        email: 'invalid-email',
        password: 'Password123!'
      });

    expect(response.text).toBe('Please enter a valid email address');
  });

  it('harus menolak jika password tidak valid', async () => {
    validatePassword.mockReturnValue({
      isValid: false,
      message: 'Password harus minimal 8 karakter'
    });

    const response = await request(app)
      .post('/register')
      .send({
        name: 'John Doe',
        email: 'john@example.com',
        password: '123'
      });

    expect(response.text).toBe('Password harus minimal 8 karakter');
  });

  it('harus menolak jika nama tidak valid', async () => {
    validateName.mockReturnValue(false);

    const response = await request(app)
      .post('/register')
      .send({
        name: '123',
        email: 'john@example.com',
        password: 'Password123!'
      });

    expect(response.text).toBe('Please enter a valid name');
  });

  it('harus menolak jika email sudah terdaftar', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { email: 'john@example.com' },
            error: null
          })
        })
      })
    });

    const response = await request(app)
      .post('/register')
      .send({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123!'
      });

    expect(response.text).toBe('Email is already registered');
  });

  it('harus menangani error database saat cek user', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'SOME_ERROR', message: 'Database error' }
          })
        })
      })
    });

    const response = await request(app)
      .post('/register')
      .send({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123!'
      });

    expect(response.text).toBe('Failed to check existing user');
  });

  it('harus menangani error saat insert user baru', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' }
          })
        })
      })
    });

    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Insert failed' }
          })
        })
      })
    });

    const response = await request(app)
      .post('/register')
      .send({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123!'
      });

    expect(response.text).toBe('Failed to register user');
  });

  it('harus menangani error yang tidak terduga', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('Unexpected error');
    });

    const response = await request(app)
      .post('/register')
      .send({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123!'
      });

    expect(response.text).toBe('Internal server error during registration');
  });
});

describe('POST /login', () => {
  let app;
  let mockFrom;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/', authRoutes);

    vi.clearAllMocks();

    mockFrom = vi.fn();
    supabase.from = mockFrom;
    generateToken.mockReturnValue('mock_token_123');
  });

  it('harus berhasil login dengan kredensial yang benar', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              user_id: 'user_123',
              name: 'John Doe',
              email: 'john@example.com',
              password: 'hashed_password'
            },
            error: null
          })
        })
      })
    });

    bcrypt.compare.mockResolvedValue(true);

    const response = await request(app)
      .post('/login')
      .send({
        email: 'john@example.com',
        password: 'Password123!'
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Login successful');
    expect(response.body.user).toEqual({
      user_id: 'user_123',
      name: 'John Doe',
      email: 'john@example.com'
    });
    expect(response.body.user.password).toBeUndefined();
    expect(response.body.token).toBe('mock_token_123');
  });

  it('harus menolak jika email atau password tidak dikirim', async () => {
    const response = await request(app)
      .post('/login')
      .send({
        email: 'john@example.com'
        // password tidak dikirim
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Email and password are required');
  });

  it('harus menolak jika user tidak ditemukan', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' }
          })
        })
      })
    });

    const response = await request(app)
      .post('/login')
      .send({
        email: 'notfound@example.com',
        password: 'Password123!'
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid email or password');
  });

  it('harus menolak jika password salah', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              user_id: 'user_123',
              name: 'John Doe',
              email: 'john@example.com',
              password: 'hashed_password'
            },
            error: null
          })
        })
      })
    });

    bcrypt.compare.mockResolvedValue(false);

    const response = await request(app)
      .post('/login')
      .send({
        email: 'john@example.com',
        password: 'WrongPassword123!'
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid email or password');
  });

  it('harus menangani error database saat fetch user', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' }
          })
        })
      })
    });

    const response = await request(app)
      .post('/login')
      .send({
        email: 'john@example.com',
        password: 'Password123!'
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid email or password');
  });

  it('harus menangani error yang tidak terduga', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('Unexpected error');
    });

    const response = await request(app)
      .post('/login')
      .send({
        email: 'john@example.com',
        password: 'Password123!'
      });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Internal server error during login');
  });

  it('harus memanggil bcrypt.compare dengan parameter yang benar', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              user_id: 'user_123',
              name: 'John Doe',
              email: 'john@example.com',
              password: 'hashed_password'
            },
            error: null
          })
        })
      })
    });

    bcrypt.compare.mockResolvedValue(true);

    await request(app)
      .post('/login')
      .send({
        email: 'john@example.com',
        password: 'Password123!'
      });

    expect(bcrypt.compare).toHaveBeenCalledWith('Password123!', 'hashed_password');
  });
});

describe('404 Handler', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/', authRoutes);
  });

  it('harus mengembalikan 404 untuk rute yang tidak ada', async () => {
    const response = await request(app).get('/rute-tidak-ada');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Route not found');
  });
});