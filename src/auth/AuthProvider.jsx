import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
const STORAGE_KEY = 'tickd-active-workspace-id'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [workspaces, setWorkspaces] = useState([]) // [{ id, name, role, ... }]
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)

  // ---------- Track session ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setAuthLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // ---------- Load ALL workspaces the user is a member of ----------
  useEffect(() => {
    if (!user) {
      setWorkspaces([])
      setActiveWorkspaceIdState(null)
      return
    }

    let cancelled = false
    setWorkspaceLoading(true)
    ;(async () => {
      const { data: memberships, error: memErr } = await supabase
        .from('workspace_members')
        .select('workspace_id, role')
        .eq('user_id', user.id)

      if (cancelled) return
      if (memErr || !memberships || memberships.length === 0) {
        if (memErr) console.warn('[auth] workspace_members error', memErr)
        setWorkspaces([])
        setActiveWorkspaceIdState(null)
        setWorkspaceLoading(false)
        return
      }

      const ids = memberships.map((m) => m.workspace_id)
      const { data: wsRows, error: wsErr } = await supabase
        .from('workspaces')
        .select('*')
        .in('id', ids)
        .order('name')

      if (cancelled) return
      if (wsErr || !wsRows) {
        console.warn('[auth] workspaces fetch failed', wsErr)
        setWorkspaces([])
        setActiveWorkspaceIdState(null)
        setWorkspaceLoading(false)
        return
      }

      // Merge role into each workspace row
      const roleByWs = new Map(memberships.map((m) => [m.workspace_id, m.role]))
      const ws = wsRows.map((w) => ({ ...w, role: roleByWs.get(w.id) ?? null }))
      setWorkspaces(ws)

      // Restore active selection — last used, or first available
      const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
      const validSaved = saved && ws.some((w) => w.id === saved) ? saved : null
      setActiveWorkspaceIdState(validSaved ?? ws[0]?.id ?? null)
      setWorkspaceLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [user])

  function setActiveWorkspace(id) {
    if (!workspaces.some((w) => w.id === id)) return
    setActiveWorkspaceIdState(id)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, id)
    }
  }

  const workspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  )

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: authLoading,
        workspaces,
        workspace,
        activeWorkspaceId,
        setActiveWorkspace,
        workspaceLoading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
