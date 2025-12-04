import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import feedbackRouter from '../routes/feedback.js';
import { supabase } from '../supabaseClient.js';
import { generateId } from '../utils/helpers.js';

vi.mock('../supabaseClient.js');
vi.mock('../utils/helpers.js');

describe('Feedback Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(feedbackRouter);
    vi.clearAllMocks();
  });

  describe('GET /feedback', () => {
    it('mengembalikan semua feedback secara sukses', async () => {
      const mockHistory = [
        {
          history_id: 'hist1',
          text: 'Great service!',
          feedback: 'Thank you for feedback',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          history_id: 'hist2',
          text: 'Nice app',
          feedback: 'We appreciate it',
          created_at: '2024-01-02T00:00:00Z'
        }
      ];

      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: mockHistory,
            error: null
          })
        })
      });

      const response = await request(app).get('/feedback');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toMatchObject({
        id: 'hist1',
        user_name: 'Anonymous',
        text: 'Great service!',
        analysis_result: { feedback: 'Thank you for feedback' }
      });
    });

    it('menangani database error', async () => {
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null,
            error: new Error('Database error')
          })
        })
      });

      const response = await request(app).get('/feedback');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch feedback' });
    });
  });

  describe('POST /feedback', () => {
    it('mengembalikan feedback', async () => {
      const mockGeneratedId = 'generated123';
      vi.mocked(generateId).mockReturnValue(mockGeneratedId);

      const mockInsertedData = {
        history_id: mockGeneratedId,
        user_id: `feedback_${mockGeneratedId}`,
        text: 'New feedback',
        feedback: 'Custom feedback response',
        created_at: '2024-01-01T00:00:00Z'
      };

      supabase.from = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockInsertedData,
              error: null
            })
          })
        })
      });

      const response = await request(app)
        .post('/feedback')
        .send({
          user_name: 'John Doe',
          text: 'New feedback',
          analysis_result: { feedback: 'Custom feedback response' }
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: mockGeneratedId,
        user_name: 'John Doe',
        text: 'New feedback',
        analysis_result: { feedback: 'Custom feedback response' }
      });
    });

    it('mengembalikan 404 ketika user_name tidak ada', async () => {
      const response = await request(app)
        .post('/feedback')
        .send({
          text: 'Feedback without name'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'User name and text are required' });
    });

    it('mengembalikan 400 jika teks hilang', async () => {
      const response = await request(app)
        .post('/feedback')
        .send({
          user_name: 'John Doe'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'User name and text are required' });
    });

    it('menggunakan default feedback jika analysis_result tidak ada', async () => {
      const mockGeneratedId = 'generated456';
      vi.mocked(generateId).mockReturnValue(mockGeneratedId);

      const mockInsertedData = {
        history_id: mockGeneratedId,
        user_id: `feedback_${mockGeneratedId}`,
        text: 'Simple feedback',
        feedback: 'Thank you for your feedback',
        created_at: '2024-01-01T00:00:00Z'
      };

      supabase.from = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockInsertedData,
              error: null
            })
          })
        })
      });

      const response = await request(app)
        .post('/feedback')
        .send({
          user_name: 'Jane Doe',
          text: 'Simple feedback'
        });

      expect(response.status).toBe(201);
      expect(response.body.analysis_result).toBeUndefined();
    });

    it('menangani database error ketika diinsert', async () => {
      vi.mocked(generateId).mockReturnValue('id123');

      supabase.from = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('Insert failed')
            })
          })
        })
      });

      const response = await request(app)
        .post('/feedback')
        .send({
          user_name: 'Test User',
          text: 'Test feedback'
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to create feedback' });
    });
  });

  describe('GET /feedback/:id', () => {
    it('mengembalikan feedback dengan ID', async () => {
      const mockFeedback = {
        history_id: 'hist123',
        text: 'Specific feedback',
        feedback: 'Response to feedback',
        created_at: '2024-01-01T00:00:00Z'
      };

      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockFeedback,
              error: null
            })
          })
        })
      });

      const response = await request(app).get('/feedback/hist123');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: 'hist123',
        user_name: 'Anonymous',
        text: 'Specific feedback',
        analysis_result: { feedback: 'Response to feedback' }
      });
    });

    it('mengembalika 404 jika tidak ada feedback', async () => {
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('Not found')
            })
          })
        })
      });

      const response = await request(app).get('/feedback/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Feedback not found' });
    });

    it('bisa menangani database error', async () => {
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockRejectedValue(new Error('Database error'))
          })
        })
      });

      const response = await request(app).get('/feedback/hist123');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch feedback' });
    });
  });


});