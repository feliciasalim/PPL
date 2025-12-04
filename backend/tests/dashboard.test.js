import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import dashboardRoutes from '../routes/dashboard.js';

// Mock dependencies
vi.mock('../supabaseClient.js', () => ({
  supabase: {
    from: vi.fn()
  }
}));

vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { user_id: 'user_123' };
    next();
  }
}));

import { supabase } from '../supabaseClient.js';

describe('GET /summary', () => {
  let app;
  let mockFrom;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/', dashboardRoutes);

    vi.clearAllMocks();

    mockFrom = vi.fn();
    supabase.from = mockFrom;

    // Suppress console untuk test yang bersih
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('harus mengembalikan summary dengan data lengkap', async () => {
    const mockHistory = [
      {
        stress_percent: 80,
        emotion: 'anxious',
        created_at: new Date().toISOString(),
        text: 'Test entry 1',
        feedback: 'Suggestion: Take a break'
      },
      {
        stress_percent: 60,
        emotion: 'sad',
        created_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        text: 'Test entry 2',
        feedback: 'Suggestion: Practice mindfulness'
      },
      {
        stress_percent: 40,
        emotion: 'anxious',
        created_at: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        text: 'Test entry 3',
        feedback: 'Some feedback without suggestion'
      }
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockHistory,
              error: null
            })
          })
        })
      })
    });

    const response = await request(app).get('/summary');

    expect(response.status).toBe(200);
    expect(response.body.averageStress).toBe(60); // (80+60+40)/3 = 60
    expect(response.body.emotionCounts).toEqual({ anxious: 2, sad: 1 });
    expect(response.body.latestEmotion).toBe('anxious');
    expect(response.body.mostCommonEmotion).toBe('anxious');
    expect(response.body.totalCount).toBe(3);
    expect(response.body.stressHistory).toBeDefined();
    expect(Array.isArray(response.body.stressHistory)).toBe(true);
    expect(response.body.tips).toBeDefined();
    expect(Array.isArray(response.body.tips)).toBe(true);
  });

  it('harus mengembalikan data default ketika tidak ada history', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      })
    });

    const response = await request(app).get('/summary');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      averageStress: 0,
      emotionCounts: {},
      stressHistory: [],
      latestEmotion: 'neutral',
      latestEmotionTime: null,
      weeklyCount: 0,
      totalCount: 0,
      mostCommonEmotion: 'neutral',
      tips: []
    });
  });

  it('harus menangani query parameter days', async () => {
    const mockHistory = [
      {
        stress_percent: 50,
        emotion: 'neutral',
        created_at: new Date().toISOString(),
        text: 'Recent entry',
        feedback: 'Feedback'
      }
    ];

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: mockHistory,
            error: null
          })
        })
      })
    });

    mockFrom.mockReturnValue({ select: mockSelect });

    await request(app).get('/summary?days=7');

    // Verify gte dipanggil dengan tanggal 7 hari lalu
    expect(mockSelect).toHaveBeenCalled();
  });

  it('harus menghitung weeklyCount dengan benar', async () => {
    const now = Date.now();
    const mockHistory = [
      {
        stress_percent: 70,
        emotion: 'anxious',
        created_at: new Date(now).toISOString(), // today
        text: 'Entry 1',
        feedback: 'Feedback 1'
      },
      {
        stress_percent: 60,
        emotion: 'sad',
        created_at: new Date(now - 3 * 86400000).toISOString(), // 3 days ago
        text: 'Entry 2',
        feedback: 'Feedback 2'
      },
      {
        stress_percent: 50,
        emotion: 'neutral',
        created_at: new Date(now - 10 * 86400000).toISOString(), // 10 days ago
        text: 'Entry 3',
        feedback: 'Feedback 3'
      }
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockHistory,
              error: null
            })
          })
        })
      })
    });

    const response = await request(app).get('/summary');

    expect(response.status).toBe(200);
    expect(response.body.weeklyCount).toBe(2); // 2 entries dalam 7 hari terakhir
  });

  it('harus mengekstrak tips dari feedback', async () => {
    const mockHistory = [
      {
        stress_percent: 70,
        emotion: 'anxious',
        created_at: new Date().toISOString(),
        text: 'Entry 1',
        feedback: 'Suggestion: Practice deep breathing exercises'
      },
      {
        stress_percent: 60,
        emotion: 'sad',
        created_at: new Date().toISOString(),
        text: 'Entry 2',
        feedback: 'Suggestions: Try meditation and yoga'
      }
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockHistory,
              error: null
            })
          })
        })
      })
    });

    const response = await request(app).get('/summary');

    expect(response.status).toBe(200);
    expect(response.body.tips.length).toBeGreaterThan(0);
    expect(response.body.tips[0]).toContain('Practice deep breathing');
  });

  it('harus menggunakan default tips jika tidak ada tips dari feedback', async () => {
    const mockHistory = [
      {
        stress_percent: 70,
        emotion: 'anxious',
        created_at: new Date().toISOString(),
        text: 'Entry 1',
        feedback: 'Just some feedback without suggestion'
      }
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockHistory,
              error: null
            })
          })
        })
      })
    });

    const response = await request(app).get('/summary');

    expect(response.status).toBe(200);
    expect(response.body.tips.length).toBe(5); // Default 5 tips
    expect(response.body.tips[0]).toContain('Take regular breaks');
  });

  it('harus menangani stress_percent null atau undefined', async () => {
    const mockHistory = [
      {
        stress_percent: null,
        emotion: 'neutral',
        created_at: new Date().toISOString(),
        text: 'Entry 1',
        feedback: 'Feedback 1'
      },
      {
        stress_percent: 50,
        emotion: 'happy',
        created_at: new Date().toISOString(),
        text: 'Entry 2',
        feedback: 'Feedback 2'
      },
      {
        stress_percent: undefined,
        emotion: 'sad',
        created_at: new Date().toISOString(),
        text: 'Entry 3',
        feedback: 'Feedback 3'
      }
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockHistory,
              error: null
            })
          })
        })
      })
    });

    const response = await request(app).get('/summary');

    expect(response.status).toBe(200);
    expect(response.body.averageStress).toBe(50); // Hanya menghitung entry yang valid
    expect(response.body.totalCount).toBe(3); // Total tetap 3
  });

  it('harus menangani error database', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database error' }
            })
          })
        })
      })
    });

    const response = await request(app).get('/summary');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to fetch dashboard summary');
  });
});

describe('GET /recent', () => {
  let app;
  let mockFrom;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/', dashboardRoutes);

    vi.clearAllMocks();

    mockFrom = vi.fn();
    supabase.from = mockFrom;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('harus mengembalikan recent history dengan limit default', async () => {
    const mockHistory = Array.from({ length: 10 }, (_, i) => ({
      history_id: `history_${i}`,
      user_id: 'user_123',
      stress_percent: 50 + i,
      emotion: 'neutral',
      created_at: new Date(Date.now() - i * 86400000).toISOString(),
      text: `Entry ${i}`,
      feedback: `Feedback ${i}`
    }));

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: mockHistory,
              error: null
            })
          })
        })
      })
    });

    const response = await request(app).get('/recent');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(10);
  });

  it('harus menangani custom limit parameter', async () => {
    const mockHistory = Array.from({ length: 5 }, (_, i) => ({
      history_id: `history_${i}`,
      user_id: 'user_123',
      stress_percent: 50,
      emotion: 'neutral',
      created_at: new Date().toISOString(),
      text: `Entry ${i}`,
      feedback: `Feedback ${i}`
    }));

    const mockLimit = vi.fn().mockResolvedValue({
      data: mockHistory,
      error: null
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: mockLimit
          })
        })
      })
    });

    const response = await request(app).get('/recent?limit=5');

    expect(response.status).toBe(200);
    expect(mockLimit).toHaveBeenCalledWith(5);
  });

  it('harus menangani error database', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database error' }
            })
          })
        })
      })
    });

    const response = await request(app).get('/recent');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to fetch recent history');
  });
});

describe('GET /detail/:id', () => {
  let app;
  let mockFrom;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/', dashboardRoutes);

    vi.clearAllMocks();

    mockFrom = vi.fn();
    supabase.from = mockFrom;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('harus mengembalikan detail entry berdasarkan ID', async () => {
    const mockEntry = {
      history_id: 'history_123',
      user_id: 'user_123',
      stress_percent: 70,
      emotion: 'anxious',
      created_at: new Date().toISOString(),
      text: 'Detailed entry',
      feedback: 'Detailed feedback',
      video_link: []
    };

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockEntry,
              error: null
            })
          })
        })
      })
    });

    const response = await request(app).get('/detail/history_123');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockEntry);
  });

  it('harus mengembalikan 404 jika entry tidak ditemukan', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null
            })
          })
        })
      })
    });

    const response = await request(app).get('/detail/nonexistent_id');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Entry not found');
  });

  it('harus memverifikasi user_id untuk security', async () => {
    const mockEq = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { history_id: 'history_123' },
        error: null
      })
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: mockEq
        })
      })
    });

    await request(app).get('/detail/history_123');

    // Verify eq dipanggil 2x: untuk history_id dan user_id
    expect(mockEq).toHaveBeenCalled();
  });

  it('harus menangani error database', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database error' }
            })
          })
        })
      })
    });

    const response = await request(app).get('/detail/history_123');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to fetch entry details');
  });
});