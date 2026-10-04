import { createContext } from 'react'

/** Lets coach text tell the board which square is being hovered. */
export const SquareHoverContext = createContext<(square: string | null) => void>(() => {})
