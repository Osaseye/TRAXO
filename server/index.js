const express = require('express')
const admin = require('firebase-admin')
const cors = require('cors')
require('dotenv').config()

const newsRouter = require('./routes/news')
const { startNewsPoller } = require('./services/newsPoller')

const app = express()
app.use(cors())
app.use(express.json())

// Initialize Firebase Admin
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    admin.initializeApp({ credential: admin.credential.cert(svc) })
    console.log('Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT_JSON')
  } catch (err) {
    console.error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', err.message)
    process.exit(1)
  }
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // Let the SDK pick up credentials from the environment
  admin.initializeApp()
  console.log('Firebase Admin initialized from GOOGLE_APPLICATION_CREDENTIALS')
} else {
  // Fallback: attempt default app; will fail on protected operations
  try {
    admin.initializeApp()
    console.warn('Firebase Admin initialized with default credentials (may be limited)')
  } catch (err) {
    console.error('Failed to initialize Firebase Admin:', err.message)
  }
}

const firestore = (() => {
  try {
    return admin.firestore()
  } catch (err) {
    console.warn('Firestore unavailable:', err.message)
    return null
  }
})()

// Health
app.get('/health', (req, res) => res.json({ status: 'ok' }))

// News
app.use('/api/news', newsRouter)

function requireAdminCredentials() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS)
}

function getTimestamp(value) {
  if (!value) return null
  return typeof value.toDate === 'function' ? value.toDate().toISOString() : value
}

// Verify token endpoint
app.post('/verify-token', async (req, res) => {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing Authorization Bearer token' })

  try {
    const decoded = await admin.auth().verifyIdToken(token)
    // Basic response — you can extend this to proxy to SQL or Data Connect
    res.json({ ok: true, uid: decoded.uid, email: decoded.email, decoded })
  } catch (err) {
    res.status(401).json({ error: 'Invalid token', details: err.message })
  }
})

// Authenticated profile endpoint (returns stubbed SQL-like profile)
app.post('/api/profile', async (req, res) => {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing Authorization Bearer token' })

  try {
    const decoded = await admin.auth().verifyIdToken(token)
    const snapshot = firestore ? await firestore.collection('users').doc(decoded.uid).get() : null
    const data = snapshot && snapshot.exists ? snapshot.data() : {}
    const profile = {
      id: decoded.uid,
      email: data?.email || decoded.email || null,
      full_name: data?.fullName || data?.name || null,
      display_name: data?.displayName || data?.fullName || data?.name || decoded.name || decoded.email || 'TRAXO Trader',
      dob: data?.dob || null,
      country: data?.country || null,
      bio: data?.bio || null,
      plan: data?.plan || 'free',
      subscription_status: data?.subscriptionStatus || 'active',
      created_at: data?.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data?.createdAt || null,
      updated_at: data?.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data?.updatedAt || null,
    }
    res.json({ ok: true, profile })
  } catch (err) {
    res.status(401).json({ error: 'Invalid token', details: err.message })
  }
})

// Authenticated trades endpoint (returns stubbed SQL-like trades array)
app.get('/api/trades', async (req, res) => {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing Authorization Bearer token' })

  try {
    const decoded = await admin.auth().verifyIdToken(token)
    if (!firestore) {
      return res.status(503).json({ error: 'Firestore unavailable', details: 'Set Firebase Admin credentials to read trades.' })
    }

    const snapshot = await firestore.collection('trades').where('userId', '==', decoded.uid).orderBy('createdAt', 'desc').limit(20).get()
    const trades = snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        symbol: data.symbol ?? null,
        side: data.side ?? null,
        entry: data.entry ?? null,
        exit: data.exit ?? null,
        rr: data.rr ?? null,
        status: data.status ?? 'open',
        created_at: getTimestamp(data.createdAt),
        updated_at: getTimestamp(data.updatedAt),
      }
    })

    res.json({ ok: true, uid: decoded.uid, trades })
  } catch (err) {
    res.status(401).json({ error: 'Invalid token', details: err.message })
  }
})

if (!requireAdminCredentials()) {
  console.warn('Server is running without Firebase Admin credentials. /api/profile and /api/trades will be limited until credentials are configured.')
}

const port = process.env.PORT || 8080
app.listen(port, () => {
  console.log(`Token verification service running on http://localhost:${port}`)
  startNewsPoller()
})
