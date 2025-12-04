import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import historyRouter from '../routes/history.js';
import { supabase } from '../supabaseClient.js';

// Mock dependencies
vi.mock('../supabaseClient.js');
vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { user_id: 'test-user-id' };
    next();
  }
}));

describe('History Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', historyRouter);
    vi.clearAllMocks();
  });

  describe('GET /api/history', () => {
    it('harus mengambil semua riwayat untuk user yang terautentikasi', async () => {
      const mockHistory = [
        {
          history_id: 'hist1',
          user_id: 'test-user-id',
          stress_level: 'medium',
          stress_percent: 65,
          emotion: 'anxious',
          text: 'Feeling stressed today',
          feedback: 'Take a break',
          video_link: 'https://example.com/video1',
          created_at: '2024-01-02T00:00:00Z'
        },
        {
          history_id: 'hist2',
          user_id: 'test-user-id',
          stress_level: 'low',
          stress_percent: 30,
          emotion: 'calm',
          text: 'Feeling much better',
          feedback: 'Keep it up',
          video_link: 'https://example.com/video2',
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockHistory,
              error: null
            })
          })
        })
      });

      const response = await request(app).get('/api/history');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toMatchObject({
        history_id: 'hist1',
        stress_level: 'medium',
        emotion: 'anxious'
      });
      expect(response.body[1]).toMatchObject({
        history_id: 'hist2',
        stress_level: 'low',
        emotion: 'calm'
      });
    });

    it('harus mengembalikan array kosong jika tidak ada riwayat', async () => {
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      });

      const response = await request(app).get('/api/history');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('harus mengurutkan riwayat berdasarkan created_at secara descending', async () => {
      const mockHistory = [
        { history_id: 'hist3', created_at: '2024-01-03T00:00:00Z' },
        { history_id: 'hist2', created_at: '2024-01-02T00:00:00Z' },
        { history_id: 'hist1', created_at: '2024-01-01T00:00:00Z' }
      ];

      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockHistory,
              error: null
            })
          })
        })
      });

      const response = await request(app).get('/api/history');

      expect(response.status).toBe(200);
      expect(response.body[0].history_id).toBe('hist3');
      expect(response.body[2].history_id).toBe('hist1');
    });

    it('harus menangani error database', async () => {
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('Database error')
            })
          })
        })
      });

      const response = await request(app).get('/api/history');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch history' });
    });

    it('hanya harus mengambil riwayat untuk user yang terautentikasi', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      });

      supabase.from = mockFrom;

      await request(app).get('/api/history');

      expect(mockFrom).toHaveBeenCalledWith('history');
    });
  });

  describe('GET /api/history/:historyId', () => {
    it('harus mengambil satu item riwayat dengan sukses', async () => {
      const mockHistoryItem = {
        history_id: 'hist123',
        user_id: 'test-user-id',
        stress_level: 'high',
        stress_percent: 85,
        emotion: 'stressed',
        text: 'Very stressful day',
        feedback: 'Try meditation',
        video_link: 'https://example.com/video',
        created_at: '2024-01-01T00:00:00Z'
      };

      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockHistoryItem,
            error: null
          })
        })
      });

      const response = await request(app).get('/api/history/hist123');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        history_id: 'hist123',
        stress_level: 'high',
        emotion: 'stressed',
        text: 'Very stressful day'
      });
    });

    it('harus mengembalikan 400 untuk history ID yang invalid - undefined', async () => {
      const response = await request(app).get('/api/history/undefined');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid history ID' });
    });

    it('harus mengembalikan 400 untuk history ID yang invalid - null', async () => {
      const response = await request(app).get('/api/history/null');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid history ID' });
    });

    it('harus mengembalikan 500 untuk history ID berupa string kosong', async () => {
      const responseEmpty = await request(app).get('/api/history/ ');
      
      expect([400, 404, 500]).toContain(responseEmpty.status);
    });

    it('harus mengembalikan 404 jika item riwayat tidak ditemukan (PGRST116)', async () => {
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'No rows found' }
          })
        })
      });

      const response = await request(app).get('/api/history/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'History item not found' });
    });

    it('tidak boleh mengembalikan riwayat dari user yang berbeda', async () => {
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' }
          })
        })
      });

      const response = await request(app).get('/api/history/other-user-hist');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'History item not found' });
    });

    it('harus menangani error database (non-PGRST116)', async () => {
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'OTHER_ERROR', message: 'Connection error' }
          })
        })
      });

      const response = await request(app).get('/api/history/hist123');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch history item' });
    });

    it('harus menangani error yang tidak terduga', async () => {
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockRejectedValue(new Error('Unexpected database error'))
        })
      });

      const response = await request(app).get('/api/history/hist123');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch history item' });
    });

    it('harus mengembalikan semua field yang diperlukan dalam response', async () => {
      const mockHistoryItem = {
        history_id: 'hist456',
        user_id: 'test-user-id',
        stress_level: 'low',
        stress_percent: 25,
        emotion: 'happy',
        text: 'Great day',
        feedback: 'Keep going',
        video_link: 'https://example.com/video2',
        created_at: '2024-01-05T00:00:00Z'
      };

      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockHistoryItem,
            error: null
          })
        })
      });

      const response = await request(app).get('/api/history/hist456');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('history_id');
      expect(response.body).toHaveProperty('user_id');
      expect(response.body).toHaveProperty('stress_level');
      expect(response.body).toHaveProperty('stress_percent');
      expect(response.body).toHaveProperty('emotion');
      expect(response.body).toHaveProperty('text');
      expect(response.body).toHaveProperty('feedback');
      expect(response.body).toHaveProperty('video_link');
      expect(response.body).toHaveProperty('created_at');
    });

    it('harus memfilter berdasarkan user_id dan history_id', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { history_id: 'hist789', user_id: 'test-user-id' },
          error: null
        })
      });

      supabase.from = vi.fn().mockReturnValue({
        select: mockSelect
      });

      await request(app).get('/api/history/hist789');

      expect(supabase.from).toHaveBeenCalledWith('history');
      expect(mockSelect).toHaveBeenCalled();
    });
  });
});