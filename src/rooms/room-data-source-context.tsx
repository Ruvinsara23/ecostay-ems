'use client';

import { createContext, ReactNode, useContext } from 'react';
import type { RoomDataSource } from './room-data-source';

const RoomDataSourceContext = createContext<RoomDataSource | null>(null);

export function RoomDataSourceProvider({
  source,
  children,
}: {
  source: RoomDataSource;
  children: ReactNode;
}) {
  return (
    <RoomDataSourceContext.Provider value={source}>{children}</RoomDataSourceContext.Provider>
  );
}

export function useRoomDataSource(): RoomDataSource {
  const source = useContext(RoomDataSourceContext);
  if (!source) {
    throw new Error('useRoomDataSource must be used inside a RoomDataSourceProvider');
  }
  return source;
}
