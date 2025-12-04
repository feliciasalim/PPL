import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';
import profileRouter from '../routes/profile.js';
import { supabase } from '../supabaseClient.js';

// Mock dependencies
vi.mock('../supabaseClient.js');
vi.mock('bcrypt');
vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { user_id: 'test-user-id' };
    next();
  }
}));

describe('Profile Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/profile', profileRouter);
    vi.clearAllMocks();
  });

  describe('GET /api/profile', () => {
    it('should fetch user profile successfully', async () => {
      const mockUser = {
        user_id: 'test-user-id',
        name: 'John Doe',
        email: 'john@example.com'
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

      const response = await request(app).get('/api/profile');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        user: {
          user_id: 'test-user-id',
          name: 'John Doe',
          email: 'john@example.com'
        }
      });
    });

    it('should return 404 if user not found', async () => {
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

      const response = await request(app).get('/api/profile');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'User not found' });
    });

    it('should handle database error', async () => {
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockRejectedValue(new Error('Database error'))
          })
        })
      });

      const response = await request(app).get('/api/profile');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch profile' });
    });
  });

  describe('PUT /api/profile', () => {
    it('should update name only', async () => {
      const mockUser = {
        password: 'hashedPassword'
      };

      const updatedUser = {
        user_id: 'test-user-id',
        name: 'Jane Doe',
        email: 'john@example.com'
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
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: updatedUser,
                  error: null
                })
              })
            })
          })
        });

      const response = await request(app)
        .put('/api/profile')
        .send({ name: 'Jane Doe' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('User profile updated successfully');
      expect(response.body.user.name).toBe('Jane Doe');
    });

    it('should update password with valid current password', async () => {
      const mockUser = {
        password: 'hashedOldPassword'
      };

      vi.mocked(bcrypt.compare)
        .mockResolvedValueOnce(true)  // currentPassword validation
        .mockResolvedValueOnce(false); // newPassword != currentPassword
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
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    user_id: 'test-user-id',
                    name: 'John Doe',
                    email: 'john@example.com'
                  },
                  error: null
                })
              })
            })
          })
        });

      const response = await request(app)
        .put('/api/profile')
        .send({
          currentPassword: 'OldPass123!@#',
          newPassword: 'NewPass123!@#'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('User profile updated successfully');
    });

    it('should return error if current password is invalid', async () => {
      const mockUser = {
        password: 'hashedPassword'
      };

      vi.mocked(bcrypt.compare).mockResolvedValue(false);

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
        .put('/api/profile')
        .send({
          currentPassword: 'WrongPass123!@#',
          newPassword: 'NewPass123!@#'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid current password' });
    });

    it('should return error if new password is invalid format', async () => {
      const mockUser = {
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
        .put('/api/profile')
        .send({
          currentPassword: 'OldPass123!@#',
          newPassword: 'weak'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Password must be at least 8 characters');
    });

    it('should return error if new password is same as current', async () => {
      const mockUser = {
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
        .put('/api/profile')
        .send({
          currentPassword: 'SamePass123!@#',
          newPassword: 'SamePass123!@#'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'New password cannot be the same as the current password'
      });
    });

    it('should return 404 if user not found', async () => {
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
        .put('/api/profile')
        .send({ name: 'New Name' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'User not found' });
    });
  });

  describe('DELETE /api/profile', () => {
    it('should delete account successfully', async () => {
      const mockUser = {
        user_id: 'test-user-id'
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
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: null
            })
          })
        })
        .mockReturnValueOnce({
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: null
            })
          })
        });

      const response = await request(app).delete('/api/profile');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Account deleted successfully' });
    });

    it('should return 404 if user not found', async () => {
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

      const response = await request(app).delete('/api/profile');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'User not found' });
    });

    it('should handle error when deleting history', async () => {
      const mockUser = {
        user_id: 'test-user-id'
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
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: new Error('Delete history failed')
            })
          })
        });

      const response = await request(app).delete('/api/profile');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete history data' });
    });

    it('should handle error when deleting user', async () => {
      const mockUser = {
        user_id: 'test-user-id'
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
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: null
            })
          })
        })
        .mockReturnValueOnce({
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: new Error('Delete user failed')
            })
          })
        });

      const response = await request(app).delete('/api/profile');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete user account' });
    });
  });
});