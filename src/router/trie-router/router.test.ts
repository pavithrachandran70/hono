import { Hono } from '../../hono'
import { runTest } from '../common.case.test'
import { TrieRouter } from './router'

describe('TrieRouter', () => {
  runTest({
    newRouter: () => new TrieRouter(),
  })

  describe('regex parameter followed by a literal segment', () => {
    const app = new Hono({ router: new TrieRouter() })
    app.get('/a/:id{[0-9]+}/[draft]', (c) => c.text(c.req.param('id')))

    it('GET /a/42/[draft]', async () => {
      const res = await app.request('/a/42/[draft]')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('42')
    })

    it('GET /a/42/draft', async () => {
      const res = await app.request('/a/42/draft')
      expect(res.status).toBe(404)
    })

    it('GET /a/42/[other]', async () => {
      const res = await app.request('/a/42/[other]')
      expect(res.status).toBe(404)
    })
  })

  describe('regex parameter followed by a literal segment without brackets', () => {
    const app = new Hono({ router: new TrieRouter() })
    app.get('/a/:id{[0-9]+}/file.html', (c) => c.text(c.req.param('id')))

    it('GET /a/42/file.html', async () => {
      const res = await app.request('/a/42/file.html')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('42')
    })
  })
})
