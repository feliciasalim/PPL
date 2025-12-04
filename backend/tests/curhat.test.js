import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import curhatRoutes from '../routes/curhat.js';

// Mock semua dependencies
vi.mock('../supabaseClient.js', () => ({
  supabase: {
    from: vi.fn()
  }
}));

vi.mock('axios');

vi.mock('../utils/helpers.js', () => ({
  generateId: vi.fn()
}));

vi.mock('luxon', () => ({
  DateTime: {
    now: vi.fn().mockReturnValue({
      setZone: vi.fn().mockReturnValue({
        toISO: vi.fn().mockReturnValue('2025-03-12T10:00:00.000+07:00')
      })
    })
  }
}));

import { supabase } from '../supabaseClient.js';
import axios from 'axios';
import { generateId } from '../utils/helpers.js';

describe('POST /curhat', () => {
  let app;
  let mockFrom;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/', curhatRoutes);

    vi.clearAllMocks();

    mockFrom = vi.fn();
    supabase.from = mockFrom;
    generateId.mockReturnValue('history_123');

    // Suppress console logs untuk test yang lebih bersih
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('harus berhasil memproses curhat tanpa user_id', async () => {
    const mockMLResponse = {
      status: 200,
      data: {
        predicted_stress: { label: 'high', confidence: 0.85 },
        predicted_emotion: { label: 'sad', confidence: 0.75 },
        stress_level: { stress_level: 80.5 },
        analysis: 'Anda mengalami tingkat stres yang tinggi.',
        recommended_videos: { 
          recommendations: [
            { title: 'Video 1', url: 'https://youtube.com/1' },
            { title: 'Video 2', url: 'https://youtube.com/2' }
          ] 
        }
      }
    };

    axios.post.mockResolvedValue(mockMLResponse);

    const response = await request(app)
      .post('/curhat')
      .send({
        text: 'Saya merasa sangat tertekan dengan pekerjaan saya akhir-akhir ini'
      });

    expect(response.status).toBe(200);
    expect(response.body.predicted_stress.label).toBe('high');
    expect(response.body.predicted_emotion.label).toBe('sad');
    expect(response.body.stress_level.stress_level).toBe(80.5);
    expect(response.body.analysis).toBe('Anda mengalami tingkat stres yang tinggi.');
    expect(response.body.recommended_videos.recommendations).toHaveLength(2);
    expect(response.body.saved_to_history).toBe(false);
  });

  it('harus berhasil memproses curhat dengan user_id dan menyimpan ke history', async () => {
    const mockMLResponse = {
      status: 200,
      data: {
        predicted_stress: { label: 'medium', confidence: 0.65 },
        predicted_emotion: { label: 'anxious', confidence: 0.70 },
        stress_level: { stress_level: 55.3 },
        analysis: 'Anda mengalami tingkat stres sedang.',
        recommended_videos: { 
          recommendations: [
            { title: 'Relaxation Video', url: 'https://youtube.com/relax' }
          ] 
        }
      }
    };

    axios.post.mockResolvedValue(mockMLResponse);

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              history_id: 'history_123',
              user_id: 'user_456',
              stress_level: 'medium',
              emotion: 'anxious'
            },
            error: null
          })
        })
      })
    });

    const response = await request(app)
      .post('/curhat')
      .send({
        text: 'Saya merasa cemas dengan ujian besok',
        user_id: 'user_456'
      });

    expect(response.status).toBe(200);
    expect(response.body.predicted_stress.label).toBe('medium');
    expect(response.body.saved_to_history).toBe(true);
    expect(response.body.history_id).toBe('history_123');
  });

  it('harus menolak jika text tidak dikirim', async () => {
    const response = await request(app)
      .post('/curhat')
      .send({
        user_id: 'user_456'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Text is required');
  });

  it('harus menolak jika text kurang dari 10 karakter', async () => {
    const response = await request(app)
      .post('/curhat')
      .send({
        text: 'Pendek',
        user_id: 'user_456'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Text must be at least 10 characters long');
  });

  it('harus menangani error ML API non-200 status', async () => {
    axios.post.mockResolvedValue({
      status: 400,
      data: { error: 'Invalid input' }
    });

    const response = await request(app)
      .post('/curhat')
      .send({
        text: 'Saya merasa sangat tertekan dengan pekerjaan saya'
      });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('ML API returned an error');
    expect(response.body.status).toBe(400);
  });

  it('harus menangani response ML API yang invalid', async () => {
    axios.post.mockResolvedValue({
      status: 200,
      data: null
    });

    const response = await request(app)
      .post('/curhat')
      .send({
        text: 'Saya merasa sangat tertekan dengan pekerjaan saya'
      });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Invalid response format from ML API');
  });

  it('harus menggunakan fallback values jika data ML tidak lengkap', async () => {
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        predicted_stress: { label: 'low', confidence: 0.90 }
        // Data lainnya tidak ada
      }
    });

    const response = await request(app)
      .post('/curhat')
      .send({
        text: 'Saya merasa sangat bahagia hari ini dengan keluarga'
      });

    expect(response.status).toBe(200);
    expect(response.body.predicted_stress.label).toBe('low');
    expect(response.body.predicted_emotion.label).toBe('neutral'); // fallback
    expect(response.body.stress_level.stress_level).toBe(50); // fallback
    expect(response.body.analysis).toBe('Your text has been analyzed successfully.'); // fallback
  });

  it('harus menangani timeout ML API', async () => {
    const timeoutError = new Error('timeout of 120000ms exceeded');
    timeoutError.code = 'ECONNABORTED';
    axios.post.mockRejectedValue(timeoutError);

    const response = await request(app)
      .post('/curhat')
      .send({
        text: 'Saya merasa sangat tertekan dengan pekerjaan saya'
      });

    expect(response.status).toBe(408);
    expect(response.body.error).toBe('ML API request timed out. Please try again.');
    expect(response.body.error_type).toBe('timeout');
  });

  it('harus menangani connection error ML API', async () => {
    const connectionError = new Error('getaddrinfo ENOTFOUND');
    connectionError.code = 'ENOTFOUND';
    axios.post.mockRejectedValue(connectionError);

    const response = await request(app)
      .post('/curhat')
      .send({
        text: 'Saya merasa sangat tertekan dengan pekerjaan saya'
      });

    expect(response.status).toBe(503);
    expect(response.body.error).toContain('Cannot connect to ML API');
    expect(response.body.error_type).toBe('connection_error');
  });

  it('harus menangani ML API error dengan response', async () => {
    const apiError = new Error('Request failed');
    apiError.response = {
      status: 500,
      data: { error: 'Internal server error' }
    };
    axios.post.mockRejectedValue(apiError);

    const response = await request(app)
      .post('/curhat')
      .send({
        text: 'Saya merasa sangat tertekan dengan pekerjaan saya'
      });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('ML API returned an error');
    expect(response.body.error_type).toBe('ml_api_error');
  });

  it('harus menangani generic error', async () => {
    axios.post.mockRejectedValue(new Error('Something went wrong'));

    const response = await request(app)
      .post('/curhat')
      .send({
        text: 'Saya merasa sangat tertekan dengan pekerjaan saya'
      });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to process text with ML API');
    expect(response.body.error_type).toBe('generic_error');
  });

  it('harus tetap berhasil meskipun gagal menyimpan history', async () => {
    const mockMLResponse = {
      status: 200,
      data: {
        predicted_stress: { label: 'medium', confidence: 0.65 },
        predicted_emotion: { label: 'neutral', confidence: 0.60 },
        stress_level: { stress_level: 50 },
        analysis: 'Analisis berhasil.',
        recommended_videos: { recommendations: [] }
      }
    };

    axios.post.mockResolvedValue(mockMLResponse);

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' }
          })
        })
      })
    });

    const response = await request(app)
      .post('/curhat')
      .send({
        text: 'Saya merasa cukup baik hari ini dengan teman-teman',
        user_id: 'user_456'
      });

    expect(response.status).toBe(200);
    expect(response.body.predicted_stress.label).toBe('medium');
    // saved_to_history bisa false atau undefined karena error di try-catch
    expect(response.body.saved_to_history).toBeFalsy(); // Menggunakan toBeFalsy() untuk cover false/undefined
    expect(response.body.history_id).toBeUndefined();
  });

  it('harus memanggil ML API dengan parameter yang benar', async () => {
    const mockMLResponse = {
      status: 200,
      data: {
        predicted_stress: { label: 'low', confidence: 0.95 },
        predicted_emotion: { label: 'happy', confidence: 0.90 },
        stress_level: { stress_level: 20 },
        analysis: 'Anda dalam kondisi baik.',
        recommended_videos: { recommendations: [] }
      }
    };

    axios.post.mockResolvedValue(mockMLResponse);

    const testText = 'Saya sangat senang dan bahagia hari ini dengan keluarga';
    await request(app)
      .post('/curhat')
      .send({ text: testText });

    // Verify ML API was called correctly
    expect(axios.post).toHaveBeenCalledTimes(1);
    
    const callArgs = axios.post.mock.calls[0];
    expect(callArgs[0]).toBe('https://feliciasalim-ppl.hf.space/predict/analyze');
    expect(callArgs[1]).toEqual({ text: testText });
    expect(callArgs[2]).toMatchObject({
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'HiddenMood-Backend/1.0'
      },
      timeout: 120000
    });
  });

  it('harus menyimpan data ke history dengan format yang benar', async () => {
    const mockMLResponse = {
      status: 200,
      data: {
        predicted_stress: { label: 'high', confidence: 0.88 },
        predicted_emotion: { label: 'angry', confidence: 0.82 },
        stress_level: { stress_level: 85.7 },
        analysis: 'Tingkat stres tinggi terdeteksi.',
        recommended_videos: { 
          recommendations: [
            { title: 'Calm Down', url: 'https://youtube.com/calm' }
          ] 
        }
      }
    };

    axios.post.mockResolvedValue(mockMLResponse);

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { history_id: 'history_123' },
          error: null
        })
      })
    });

    mockFrom.mockReturnValue({
      insert: mockInsert
    });

    const testText = 'Saya sangat marah dengan situasi ini sekali!';
    await request(app)
      .post('/curhat')
      .send({
        text: testText,
        user_id: 'user_789'
      });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        history_id: 'history_123',
        user_id: 'user_789',
        stress_level: 'high',
        stress_percent: 85.7,
        emotion: 'angry',
        text: testText,
        feedback: 'Tingkat stres tinggi terdeteksi.',
        video_link: mockMLResponse.data.recommended_videos.recommendations,
        created_at: '2025-03-12T10:00:00.000+07:00'
      })
    );
  });
});