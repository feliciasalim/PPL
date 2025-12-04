import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';
import forgotPasswordRouter from '../routes/forgotPassword.js';
import { supabase } from '../supabaseClient.js';

// Mock dependencies
vi.mock('../supabaseClient.js');
vi.mock('bcrypt');
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      verify: vi.fn((callback) => callback(null, true)),
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-id' })
    }))
  }
}));

describe('Forgot Password Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/forgot-password', forgotPasswordRouter);
    vi.clearAllMocks();
  });

  describe('POST /forgot-password/request', () => {
    it('mengirim kode verifikasi dengan sukses', async () => {
      const mockUser = {
        user_id: 'user123',
        email: 'test@example.com'
      };

      supabase.from = vi.fn()
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockUser,
                error: null
              })
            })
          })
        })
        .mockReturnValueOnce({
          insert: vi.fn().mockResolvedValue({
            error: null
          })
        });

      const response = await request(app)
        .post('/forgot-password/request')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Verification code sent' });
    });

    it('mengembalikan error jika email tidak diisi', async () => {
      const response = await request(app)
        .post('/forgot-password/request')
        .send({});

      expect(response.status).toBe(200);
      expect(response.text).toBe('Email is required');
    });

    it('mengembalikan error jika pengguna tidak ditemukan', async () => {
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('User not found')
            })
          })
        })
      });

      const response = await request(app)
        .post('/forgot-password/request')
        .send({ email: 'nonexistent@example.com' });

      expect(response.status).toBe(200);
      expect(response.text).toBe('Email not found');
    });

    it('menangani error database ketika menyimpan kode', async () => {
      supabase.from = vi.fn()
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { user_id: 'user123', email: 'test@example.com' },
                error: null
              })
            })
          })
        })
        .mockReturnValueOnce({
          insert: vi.fn().mockResolvedValue({
            error: new Error('Insert failed')
          })
        });

      const response = await request(app)
        .post('/forgot-password/request')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(200);
      expect(response.text).toBe('Failed to send code');
    });
  });

  describe('POST /forgot-password/verify', () => {
    it('memverifikasi kode dengan sukses', async () => {
      const mockResetCode = {
        id: 'code123',
        code: '123456',
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        used: false
      };

      supabase.from = vi.fn()
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockResetCode,
                error: null
              })
            })
          })
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: null
            })
          })
        });

      const response = await request(app)
        .post('/forgot-password/verify')
        .send({ email: 'test@example.com', code: '123456' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Code verified' });
    });

    it('mengembalikan error jika email atau kode tidak diisi', async () => {
      const response = await request(app)
        .post('/forgot-password/verify')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(200);
      expect(response.text).toBe('Email and code are required');
    });

    it('mengembalikan error jika kode tidak valid atau sudah kedaluwarsa', async () => {
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('Invalid code')
            })
          })
        })
      });

      const response = await request(app)
        .post('/forgot-password/verify')
        .send({ email: 'test@example.com', code: '999999' });

      expect(response.status).toBe(200);
      expect(response.text).toBe('Invalid or expired code');
    });
  });

  describe('POST /forgot-password/reset', () => {
    it('mereset password dengan sukses', async () => {
      const mockUser = {
        user_id: 'user123',
        password: 'hashedOldPassword'
      };

      vi.mocked(bcrypt.compare).mockResolvedValue(false);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashedNewPassword');

      supabase.from = vi.fn()
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockUser,
                error: null
              })
            })
          })
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: null
            })
          })
        });

      const response = await request(app)
        .post('/forgot-password/reset')
        .send({
          email: 'test@example.com',
          newPassword: 'NewPass123!@#'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Password reset successfully' });
    });

    it('mengembalikan error jika email atau password baru tidak diisi', async () => {
      const response = await request(app)
        .post('/forgot-password/reset')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(200);
      expect(response.text).toBe('Email and new password are required');
    });

    it('mengembalikan error jika password baru tidak valid', async () => {
      const mockUser = {
        user_id: 'user123',
        password: 'hashedPassword'
      };

      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockUser,
              error: null
            })
          })
        })
      });

      const response = await request(app)
        .post('/forgot-password/reset')
        .send({
          email: 'test@example.com',
          newPassword: 'weak'
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('Password must be at least 8 characters');
    });

    it('mengembalikan error jika password baru sama dengan password lama', async () => {
      const mockUser = {
        user_id: 'user123',
        password: 'hashedPassword'
      };

      vi.mocked(bcrypt.compare).mockResolvedValue(true);

      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockUser,
              error: null
            })
          })
        })
      });

      const response = await request(app)
        .post('/forgot-password/reset')
        .send({
          email: 'test@example.com',
          newPassword: 'SamePass123!@#'
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe('New password cannot be the same as the current password');
    });

    it('mengembalikan error jika pengguna tidak ditemukan', async () => {
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('User not found') 
            })
          })
        })
      });

      const response = await request(app)
        .post('/forgot-password/reset')
        .send({
          email: 'nonexistent@example.com',
          newPassword: 'NewPass123!@#'
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe('User not found');
    });
  });
});