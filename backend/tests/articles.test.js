import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import articleRoutes from '../routes/articles.js';

vi.mock('../supabaseClient.js', () => ({
  supabase: {
    from: vi.fn()
  }
}));

import { supabase } from '../supabaseClient.js';

describe('GET /articles', () => {
  let app;
  let mockSelect;
  let mockFrom;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/', articleRoutes);

    vi.clearAllMocks();

    mockSelect = vi.fn();
    mockFrom = vi.fn().mockReturnValue({
      select: mockSelect
    });
    supabase.from = mockFrom;
  });

  it('harus mengembalikan artikel dengan sukses', async () => {
    const mockArticles = [
      {
        article_id: 1,
        title: 'Artikel Test 1',
        article_link: 'https://example.com/article1',
        img: 'https://example.com/img1.jpg',
        article_intro: 'Pengantar artikel 1'
      },
      {
        article_id: 2,
        title: 'Artikel Test 2',
        article_link: 'https://example.com/article2',
        img: 'https://example.com/img2.jpg',
        article_intro: 'Pengantar artikel 2'
      }
    ];

    mockSelect.mockResolvedValue({
      data: mockArticles,
      error: null
    });

    const response = await request(app).get('/articles');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockArticles);
    expect(mockFrom).toHaveBeenCalledWith('articles');
    expect(mockSelect).toHaveBeenCalledWith('article_id, title, article_link, img, article_intro');
  });

  it('harus mengembalikan array kosong ketika tidak ada artikel ditemukan', async () => {
    mockSelect.mockResolvedValue({
      data: [],
      error: null
    });

    const response = await request(app).get('/articles');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('harus mengembalikan array kosong ketika data null', async () => {
    mockSelect.mockResolvedValue({
      data: null,
      error: null
    });

    const response = await request(app).get('/articles');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('harus menangani error Supabase', async () => {
    const mockError = {
      message: 'Koneksi database gagal',
      hint: 'Periksa koneksi jaringan Anda'
    };

    mockSelect.mockResolvedValue({
      data: null,
      error: mockError
    });

    const response = await request(app).get('/articles');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Database error',
      details: 'Koneksi database gagal',
      hint: 'Periksa koneksi jaringan Anda'
    });
  });

  it('harus menangani error Supabase tanpa hint', async () => {
    const mockError = {
      message: 'Error tidak diketahui'
    };

    mockSelect.mockResolvedValue({
      data: null,
      error: mockError
    });

    const response = await request(app).get('/articles');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Database error',
      details: 'Error tidak diketahui',
      hint: 'Check your Supabase configuration'
    });
  });

  it('harus menangani error yang tidak terduga', async () => {
    const unexpectedError = new Error('Terjadi error yang tidak terduga');
    mockSelect.mockRejectedValue(unexpectedError);

    const response = await request(app).get('/articles');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to fetch articles');
    expect(response.body.details).toBe('Terjadi error yang tidak terduga');
  });

  it('harus menyertakan stack trace dalam mode development', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const unexpectedError = new Error('Test error');
    mockSelect.mockRejectedValue(unexpectedError);

    const response = await request(app).get('/articles');

    expect(response.status).toBe(500);
    expect(response.body.stack).toBeDefined();

    process.env.NODE_ENV = originalEnv;
  });

  it('tidak boleh menyertakan stack trace dalam mode production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const unexpectedError = new Error('Test error');
    mockSelect.mockRejectedValue(unexpectedError);

    const response = await request(app).get('/articles');

    expect(response.status).toBe(500);
    expect(response.body.stack).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });

  it('harus memanggil console.log dengan pesan yang benar saat sukses', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    const mockArticles = [{ article_id: 1, title: 'Test' }];
    mockSelect.mockResolvedValue({
      data: mockArticles,
      error: null
    });

    await request(app).get('/articles');

    expect(consoleSpy).toHaveBeenCalledWith('Fetching articles from Supabase...');
    expect(consoleSpy).toHaveBeenCalledWith('Successfully fetched articles:', 1);

    consoleSpy.mockRestore();
  });

  it('harus memanggil console.error saat terjadi error Supabase', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const mockError = { message: 'Error' };
    mockSelect.mockResolvedValue({
      data: null,
      error: mockError
    });

    await request(app).get('/articles');

    expect(consoleErrorSpy).toHaveBeenCalledWith('Supabase error:', mockError);

    consoleErrorSpy.mockRestore();
  });
});