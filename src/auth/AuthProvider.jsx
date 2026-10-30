import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseClient, supabaseConfigurationError } from '../lib/supabaseClient.js'
import { AuthContext } from './AuthContext.js'

const SAFE_AUTH_ERRORS = {
  signIn: "We couldn't sign you in with those details. Check your email and password and try again.",
  signUp: "We couldn't create your account. Check your details and try again.",
  signOut: "We couldn't sign you out. Please try again.",
}

function authUnavailableError(configurationError) {
  return configurationError ?? new Error('Authentication is not configured for this app.')
}

export function AuthProvider({
  children,
  client = supabaseClient,
  configurationError = supabaseConfigurationError,
}) {
  const [authState, setAuthState] = useState(() => ({
    client,
    user: null,
    loading: Boolean(client),
  }))
  const currentAuthState =
    authState.client === client ? authState : { user: null, loading: Boolean(client) }
  const { user, loading } = currentAuthState

  useEffect(() => {
    if (!client?.auth?.onAuthStateChange) return undefined

    let active = true
    let subscription

    try {
      const result = client.auth.onAuthStateChange((_event, session) => {
        if (!active) return
        setAuthState({ client, user: session?.user ?? null, loading: false })
      })
      subscription = result?.data?.subscription
    } catch {
      queueMicrotask(() => {
        if (active) setAuthState({ client, user: null, loading: false })
      })
    }

    return () => {
      active = false
      subscription?.unsubscribe()
    }
  }, [client])

  const signIn = useCallback(
    async (email, password) => {
      if (!client) throw authUnavailableError(configurationError)
      try {
        const { data, error } = await client.auth.signInWithPassword({ email, password })
        if (error) throw error
        const signedInUser = data?.user ?? data?.session?.user
        if (signedInUser) setAuthState({ client, user: signedInUser, loading: false })
        return data
      } catch {
        throw new Error(SAFE_AUTH_ERRORS.signIn)
      }
    },
    [client, configurationError],
  )

  const signUp = useCallback(
    async (email, password) => {
      if (!client) throw authUnavailableError(configurationError)
      try {
        const { data, error } = await client.auth.signUp({ email, password })
        if (error) throw error
        const signedUpUser = data?.user ?? data?.session?.user
        if (data?.session && signedUpUser) {
          setAuthState({ client, user: signedUpUser, loading: false })
        }
        return data
      } catch {
        throw new Error(SAFE_AUTH_ERRORS.signUp)
      }
    },
    [client, configurationError],
  )

  const signOut = useCallback(async () => {
    if (!client) throw authUnavailableError(configurationError)
    try {
      const { error } = await client.auth.signOut()
      if (error) throw error
      setAuthState({ client, user: null, loading: false })
    } catch {
      throw new Error(SAFE_AUTH_ERRORS.signOut)
    }
  }, [client, configurationError])

  const value = useMemo(
    () => ({
      user,
      loading,
      configurationError: client ? null : configurationError,
      signIn,
      signUp,
      signOut,
    }),
    [user, loading, client, configurationError, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
