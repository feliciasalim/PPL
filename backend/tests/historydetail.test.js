import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import historyDetailRouter from '../routes/historydetail.js';
import { supabase } from '../supabaseClient.js';

// Mock dependencies
vi.mock('../supabaseClient.js');
vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { user_id: 'test-user-id' };
    next();
  }
}));

describe('History Detail Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', historyDetailRouter);
    vi.clearAllMocks();
  });

  describe('GET /api/history/:historyId', () => {
    it('harus mengambil detail riwayat dengan sukses', async () => {
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

    it('harus mengembalikan 404 jika item riwayat tidak ditemukan', async () => {
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'No rows found' }
          })
        })
      });

      const response = await request(app).get('/api/history/nonexistent-id');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'History item not found' });
    });

    it('tidak boleh mengembalikan riwayat milik user lain', async () => {
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' }
          })
        })
      });

      const response = await request(app).get('/api/history/other-user-history');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'History item not found' });
    });

    it('harus menangani error database dengan code non-PGRST116', async () => {
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: '23505', message: 'Duplicate key error' }
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
          single: vi.fn().mockRejectedValue(new Error('Network error'))
        })
      });

      const response = await request(app).get('/api/history/hist123');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch history item' });
    });

    it('harus mengembalikan semua field yang diperlukan', async () => {
      const mockHistoryItem = {
        history_id: 'hist999',
        user_id: 'test-user-id',
        stress_level: 'medium',
        stress_percent: 50,
        emotion: 'neutral',
        text: 'Normal day',
        feedback: 'Everything is fine',
        video_link: 'https://example.com/video3',
        created_at: '2024-01-10T00:00:00Z'
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

      const response = await request(app).get('/api/history/hist999');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('history_id', 'hist999');
      expect(response.body).toHaveProperty('user_id', 'test-user-id');
      expect(response.body).toHaveProperty('stress_level', 'medium');
      expect(response.body).toHaveProperty('stress_percent', 50);
      expect(response.body).toHaveProperty('emotion', 'neutral');
      expect(response.body).toHaveProperty('text', 'Normal day');
      expect(response.body).toHaveProperty('feedback', 'Everything is fine');
      expect(response.body).toHaveProperty('video_link');
      expect(response.body).toHaveProperty('created_at');
    });

    it('harus melakukan query dengan historyId yang benar', async () => {
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: { history_id: 'test-hist', user_id: 'test-user-id' },
        error: null
      });

      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: mockEq,
          single: mockSingle
        })
      });

      await request(app).get('/api/history/test-hist');

      expect(supabase.from).toHaveBeenCalledWith('history');
      expect(mockEq).toHaveBeenCalledWith('history_id', 'test-hist');
      expect(mockEq).toHaveBeenCalledWith('user_id', 'test-user-id');
    });

    it('harus mengembalikan data dengan tipe yang benar', async () => {
      const mockHistoryItem = {
        history_id: 'hist-type-test',
        user_id: 'test-user-id',
        stress_level: 'low',
        stress_percent: 20,
        emotion: 'happy',
        text: 'Great day!',
        feedback: 'Keep it up!',
        video_link: 'https://example.com/motivational',
        created_at: '2024-01-15T10:30:00Z'
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

      const response = await request(app).get('/api/history/hist-type-test');

      expect(response.status).toBe(200);
      expect(typeof response.body.history_id).toBe('string');
      expect(typeof response.body.stress_percent).toBe('number');
      expect(typeof response.body.text).toBe('string');
    });

    it('harus menangani historyId dengan format UUID', async () => {
      const uuidHistoryId = '550e8400-e29b-41d4-a716-446655440000';
      const mockHistoryItem = {
        history_id: uuidHistoryId,
        user_id: 'test-user-id',
        stress_level: 'low',
        stress_percent: 30,
        emotion: 'calm',
        text: 'Relaxed',
        feedback: 'Good',
        video_link: '',
        created_at: '2024-01-20T00:00:00Z'
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

      const response = await request(app).get(`/api/history/${uuidHistoryId}`);

      expect(response.status).toBe(200);
      expect(response.body.history_id).toBe(uuidHistoryId);
    });

    it('harus menangani video_link yang kosong', async () => {
      const mockHistoryItem = {
        history_id: 'hist-no-video',
        user_id: 'test-user-id',
        stress_level: 'medium',
        stress_percent: 45,
        emotion: 'neutral',
        text: 'Just okay',
        feedback: 'Take it easy',
        video_link: '',
        created_at: '2024-01-25T00:00:00Z'
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

      const response = await request(app).get('/api/history/hist-no-video');

      expect(response.status).toBe(200);
      expect(response.body.video_link).toBe('');
    });
  });
});