import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [workspace, setWorkspace] = useState(null)
  const [people, setPeople] = useState([])
  const [workspaceLoading, setWorkspaceLoading] = useState(false)

  // 1. Track session
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

  // 2. When user changes, load their workspace + people
  useEffect(() => {
    if (!user) {
      setWorkspace(null)
      setPeople([])
      return
    }

    let cancelled = false
    setWorkspaceLoading(true)
    ;(async () => {
      const { data: member, error: memberErr } = await supabase
        .from('workspace_members')
        .select('workspace_id, role, workspaces(*)')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      if (cancelled) return
      if (memberErr || !member?.workspaces) {
        setWorkspace(null)
        setPeople([])
        setWorkspaceLoading(false)
        return
      }

      const ws = member.workspaces
      setWorkspace(ws)

      const { data: peopleData } = await supabase
        .from('people')
        .select('*')
        .eq('workspace_id', ws.id)
        .eq('is_active', true)
        .order('name')

      if (cancelled) return
      setPeople(peopleData ?? [])
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
        people,
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
