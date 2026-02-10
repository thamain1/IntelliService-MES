import type { Database } from '../lib/database.types';

type Ticket = Database['public']['Tables']['tickets']['Row'];
type _Customer = Database['public']['Tables']['customers']['Row'];

export interface TechnicianMapData {
  id: string;
  full_name: string;
  phone: string | null;
  email: string;
  location: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    timestamp: string;
  } | null;
  activeTickets: Array<{
    id: string;
    ticket_number: string;
    title: string;
    status: string;
    priority: string;
    customer_name: string;
    customer_address: string | null;
    customer_latitude: number | null;
    customer_longitude: number | null;
    scheduled_date: string | null;
    estimated_duration: number | null;
  }>;
  status: 'online' | 'recent' | 'offline';
}

export interface TicketMapData extends Ticket {
  customers?: {
    name: string;
    address: string;
    city: string;
    state: string;
    latitude: number | null;
    longitude: number | null;
    place_id: string | null;
  };
  profiles?: { full_name: string };
}

export type TechnicianOnlineStatus = 'online' | 'recent' | 'offline';

export function getTechnicianStatus(timestamp: string | undefined): TechnicianOnlineStatus {
  if (!timestamp) return 'offline';

  const lastUpdate = new Date(timestamp);
  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - lastUpdate.getTime()) / 60000);

  if (diffMinutes < 5) return 'online';
  if (diffMinutes < 30) return 'recent';
  return 'offline';
}

export function getStatusColor(status: TechnicianOnlineStatus): string {
  switch (status) {
    case 'online': return '#22c55e'; // green-500
    case 'recent': return '#eab308'; // yellow-500
    case 'offline': return '#ef4444'; // red-500
  }
}
