-- ============================================================
-- TALENCO.BJ — Système de paiement : users + transactions + reactivation_tokens
-- Exécuter dans Supabase SQL Editor ou via: supabase db push
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  nom TEXT,
  prenom TEXT,
  telephone TEXT,
  role TEXT CHECK (role IN ('candidat', 'entreprise')) NOT NULL DEFAULT 'candidat',
  status TEXT CHECK (status IN ('active', 'suspended', 'pending')) DEFAULT 'pending',
  subscription_start TIMESTAMPTZ,
  subscription_end TIMESTAMPTZ,
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  credits INTEGER DEFAULT 0,
  societe TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fedapay_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  nom TEXT,
  telephone TEXT,
  amount INTEGER NOT NULL,
  type TEXT CHECK (type IN ('candidat_subscribe','candidat_reactivate','enterprise_purchase')) NOT NULL,
  status TEXT CHECK (status IN ('pending','success','failed')) DEFAULT 'pending',
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reactivation_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_last_activity ON users(last_activity);
CREATE INDEX IF NOT EXISTS idx_transactions_fedapay_id ON transactions(fedapay_id);
CREATE INDEX IF NOT EXISTS idx_reactivation_tokens_token ON reactivation_tokens(token);
