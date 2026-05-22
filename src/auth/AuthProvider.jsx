import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [workspace, setWorkspace] = useState(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)

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

  // Load the user's workspace. People + departments now live in their own
  // TanStack Query hooks (usePeople, useDepartments) so settings mutations
  // can invalidate cleanly.
  useEffect(() => {
    if (!user) {
      setWorkspace(null)
      return
    }

    let cancelled = false
    setWorkspaceLoading(true)
    ;(async () => {
      const { data: member, error: memberErr } = await supabase
        .from('workspace_members')
        .select('workspace_id, role')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      if (cancelled) return
      if (memberErr || !member) {
        if (memberErr) console.warn('[auth] workspace_members error', memberErr)
        setWorkspace(null)
        setWorkspaceLoading(false)
        return
      }

      const { data: ws, error: wsErr } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', member.workspace_id)
        .maybeSingle()

      if (cancelled) return
      if (wsErr || !ws) {
        if (wsErr) console.warn('[auth] workspaces error', wsErr)
        setWorkspace(null)
        setWorkspaceLoading(false)
        return
      }

      setWorkspace(ws)
      setWorkspaceLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [user])

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: authLoading,
        workspace,
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
