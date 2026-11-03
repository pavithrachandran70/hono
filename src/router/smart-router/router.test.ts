import { Hono } from '../../hono'
import { runTest } from '../common.case.test'
import { RegExpRouter } from '../reg-exp-router'
import { TrieRouter } from '../trie-router'
import { SmartRouter } from './router'

describe('SmartRouter', () => {
  runTest({
    newRouter: () =>
      new SmartRouter({
        routers: [new RegExpRouter(), new TrieRouter()],
      }),
  })

  describe('regex parameter followed by a literal segment', () => {
    it('matches when SmartRouter selects RegExpRouter for a single route', async () => {
      const app = new Hono()
      app.get('/a/:id{[0-9]+}/[draft]', (c) => c.text(c.req.param('id')))

      const res = await app.request('/a/42/[draft]')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('42')
      expect(app.router.name).toBe('SmartRouter + RegExpRouter')
    })

    it('matches after SmartRouter falls back to TrieRouter', async () => {
      const app = new Hono()
      app.get('/a/:id{[0-9]+}/[draft]', (c) => c.text(c.req.param('id')))
      // A static path and a param at the same position are unsupported by RegExpRouter.
      app.get('/api/items', (c) => c.text('items'))
      app.get('/api/:slug', (c) => c.text(c.req.param('slug')))
      app.get('/health', (c) => c.text('ok'))

      const res = await app.request('/a/42/[draft]')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('42')
      expect(app.router.name).toBe('SmartRouter + TrieRouter')
    })
  })
})
