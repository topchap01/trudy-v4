// apps/frontend/src/warroom/useWarRoom.jsx
// Custom hook to consume the WarRoom context.
import { useContext } from 'react'
import { WarRoomContext } from './WarRoomContext.jsx'

/**
 * Returns the current WarRoom context value.
 * Must be called inside a <WarRoomProvider>.
 */
export function useWarRoom() {
  const ctx = useContext(WarRoomContext)
  if (ctx === undefined) {
    throw new Error('useWarRoom must be used within a <WarRoomProvider>')
  }
  return ctx
}
