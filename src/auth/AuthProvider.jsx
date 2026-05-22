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
      // Step 1: find the user's membership row
      const { data: member, error: memberErr } = await supabase
        .from('workspace_members')
        .select('workspace_id, role')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      if (cancelled) return

      if (memberErr) {
        console.warn('[auth] workspace_members query error', memberErr)
        setWorkspace(null)
        setPeople([])
        setWorkspaceLoading(false)
        return
      }
      if (!member) {
        console.warn('[auth] no workspace_members row for user', user.id, user.email)
        setWorkspace(null)
        setPeople([])
        setWorkspaceLoading(false)
        return
      }

      // Step 2: fetch the workspace itself
      const { data: ws, error: wsErr } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', member.workspace_id)
        .maybeSingle()

      if (cancelled) return

      if (wsErr || !ws) {
        console.warn('[auth] workspaces query failed', { wsErr, workspaceId: member.workspace_id })
        setWorkspace(null)
        setPeople([])
        setWorkspaceLoading(false)
        return
      }

      setWorkspace(ws)

      // Step 3: load people in that workspace
      const { data: peopleData, error: peopleErr } = await supabase
        .from('people')
        .select('*')
        .eq('workspace_id', ws.id)
        .eq('is_active', true)
        .order('name')

      if (cancelled) return
      if (peopleErr) {
        console.warn('[auth] people query error', peopleErr)
      }
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
