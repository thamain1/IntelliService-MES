import { supabase } from '../lib/supabase';

export interface ConflictingTicket {
  ticketId: string;
  ticketNumber: string;
  title: string;
  start: Date;
  end: Date;
  customerName?: string;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictingTickets: ConflictingTicket[];
  message?: string;
}

export interface ConflictCheckParams {
  technicianId: string;
  proposedStart: Date;
  proposedEnd: Date;
  excludeTicketId?: string;
}

/**
 * Check if a proposed assignment conflicts with existing tickets for a technician
 */
export async function checkForConflicts(params: ConflictCheckParams): Promise<ConflictResult> {
  try {
    const { technicianId, proposedStart, proposedEnd, excludeTicketId } = params;

    // Get all tickets for this technician on the same day
    const startOfDay = new Date(proposedStart);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(proposedStart);
    endOfDay.setHours(23, 59, 59, 999);

    let query = supabase
      .from('tickets')
      .select('id, ticket_number, title, scheduled_date, estimated_duration, customers!tickets_customer_id_fkey(name)')
      .eq('assigned_to', technicianId)
      .gte('scheduled_date', startOfDay.toISOString())
      .lte('scheduled_date', endOfDay.toISOString())
      .in('status', ['open', 'scheduled', 'in_progress']);

    if (excludeTicketId) {
      query = query.neq('id', excludeTicketId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error checking for conflicts:', error);
      return {
        hasConflict: false,
        conflictingTickets: [],
        message: 'Error checking for conflicts',
      };
    }

    const conflictingTickets: ConflictingTicket[] = [];

    for (const ticket of data || []) {
      if (!ticket.scheduled_date) continue;

      const ticketStart = new Date(ticket.scheduled_date);
      const ticketDuration = ticket.estimated_duration || 120; // Default 2 hours
      const ticketEnd = new Date(ticketStart.getTime() + ticketDuration * 60 * 1000);

      // Check for overlap
      // Overlap exists if: proposedStart < ticketEnd AND proposedEnd > ticketStart
      if (proposedStart < ticketEnd && proposedEnd > ticketStart) {
        conflictingTickets.push({
          ticketId: ticket.id,
          ticketNumber: ticket.ticket_number,
          title: ticket.title,
          start: ticketStart,
          end: ticketEnd,
          customerName: (ticket.customers as { name: string } | null)?.name,
        });
      }
    }

    return {
      hasConflict: conflictingTickets.length > 0,
      conflictingTickets,
      message: conflictingTickets.length > 0
        ? `This time slot overlaps with ${conflictingTickets.length} existing ticket${conflictingTickets.length > 1 ? 's' : ''}`
        : undefined,
    };
  } catch (error) {
    console.error('Exception checking for conflicts:', error);
    return {
      hasConflict: false,
      conflictingTickets: [],
      message: 'Error checking for conflicts',
    };
  }
}

/**
 * Get all conflicts for a technician on a specific date
 * Returns a map of ticketId -> array of conflicting ticketIds
 */
export async function getTechnicianConflictsForDate(
  technicianId: string,
  date: Date
): Promise<Map<string, string[]>> {
  const conflicts = new Map<string, string[]>();

  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('tickets')
      .select('id, scheduled_date, estimated_duration')
      .eq('assigned_to', technicianId)
      .gte('scheduled_date', startOfDay.toISOString())
      .lte('scheduled_date', endOfDay.toISOString())
      .in('status', ['open', 'scheduled', 'in_progress'])
      .order('scheduled_date', { ascending: true });

    if (error) {
      console.error('Error fetching technician tickets:', error);
      return conflicts;
    }

    const tickets = data || [];

    // Compare each ticket with every other ticket
    for (let i = 0; i < tickets.length; i++) {
      const ticket1 = tickets[i];
      if (!ticket1.scheduled_date) continue;

      const start1 = new Date(ticket1.scheduled_date);
      const duration1 = ticket1.estimated_duration || 120;
      const end1 = new Date(start1.getTime() + duration1 * 60 * 1000);

      for (let j = i + 1; j < tickets.length; j++) {
        const ticket2 = tickets[j];
        if (!ticket2.scheduled_date) continue;

        const start2 = new Date(ticket2.scheduled_date);
        const duration2 = ticket2.estimated_duration || 120;
        const end2 = new Date(start2.getTime() + duration2 * 60 * 1000);

        // Check for overlap
        if (start1 < end2 && end1 > start2) {
          // Add conflict for ticket1
          if (!conflicts.has(ticket1.id)) {
            conflicts.set(ticket1.id, []);
          }
          conflicts.get(ticket1.id)!.push(ticket2.id);

          // Add conflict for ticket2
          if (!conflicts.has(ticket2.id)) {
            conflicts.set(ticket2.id, []);
          }
          conflicts.get(ticket2.id)!.push(ticket1.id);
        }
      }
    }

    return conflicts;
  } catch (error) {
    console.error('Exception getting technician conflicts:', error);
    return conflicts;
  }
}

/**
 * Get all conflicts for all technicians on a specific date
 * Returns a map of ticketId -> boolean (true if has conflict)
 */
export async function getAllConflictsForDate(date: Date): Promise<Map<string, boolean>> {
  const conflictMap = new Map<string, boolean>();

  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('tickets')
      .select('id, assigned_to, scheduled_date, estimated_duration')
      .gte('scheduled_date', startOfDay.toISOString())
      .lte('scheduled_date', endOfDay.toISOString())
      .in('status', ['open', 'scheduled', 'in_progress'])
      .not('assigned_to', 'is', null)
      .order('assigned_to', { ascending: true })
      .order('scheduled_date', { ascending: true });

    if (error) {
      console.error('Error fetching all tickets:', error);
      return conflictMap;
    }

    const tickets = data || [];

    // Group tickets by technician
    const technicianTickets = new Map<string, typeof tickets>();
    for (const ticket of tickets) {
      if (!ticket.assigned_to) continue;
      if (!technicianTickets.has(ticket.assigned_to)) {
        technicianTickets.set(ticket.assigned_to, []);
      }
      technicianTickets.get(ticket.assigned_to)!.push(ticket);
    }

    // Check for conflicts within each technician's tickets
    for (const techTickets of technicianTickets.values()) {
      for (let i = 0; i < techTickets.length; i++) {
        const ticket1 = techTickets[i];
        if (!ticket1.scheduled_date) continue;

        const start1 = new Date(ticket1.scheduled_date);
        const duration1 = ticket1.estimated_duration || 120;
        const end1 = new Date(start1.getTime() + duration1 * 60 * 1000);

        for (let j = i + 1; j < techTickets.length; j++) {
          const ticket2 = techTickets[j];
          if (!ticket2.scheduled_date) continue;

          const start2 = new Date(ticket2.scheduled_date);
          const duration2 = ticket2.estimated_duration || 120;
          const end2 = new Date(start2.getTime() + duration2 * 60 * 1000);

          // Check for overlap
          if (start1 < end2 && end1 > start2) {
            conflictMap.set(ticket1.id, true);
            conflictMap.set(ticket2.id, true);
          }
        }
      }
    }

    return conflictMap;
  } catch (error) {
    console.error('Exception getting all conflicts:', error);
    return conflictMap;
  }
}

/**
 * Get conflicts for a date range (for calendar view)
 * Returns a map of date string (YYYY-MM-DD) -> count of conflicting tickets
 */
export async function getConflictsForDateRange(
  startDate: Date,
  endDate: Date
): Promise<Map<string, number>> {
  const conflictsByDate = new Map<string, number>();

  try {
    const { data, error } = await supabase
      .from('tickets')
      .select('id, assigned_to, scheduled_date, estimated_duration')
      .gte('scheduled_date', startDate.toISOString())
      .lte('scheduled_date', endDate.toISOString())
      .in('status', ['open', 'scheduled', 'in_progress'])
      .not('assigned_to', 'is', null)
      .order('assigned_to', { ascending: true })
      .order('scheduled_date', { ascending: true });

    if (error) {
      console.error('Error fetching tickets for date range:', error);
      return conflictsByDate;
    }

    const tickets = data || [];

    // Group tickets by technician and date
    const technicianDayTickets = new Map<string, typeof tickets>();
    for (const ticket of tickets) {
      if (!ticket.assigned_to || !ticket.scheduled_date) continue;
      const dateKey = new Date(ticket.scheduled_date).toISOString().split('T')[0];
      const key = `${ticket.assigned_to}_${dateKey}`;
      if (!technicianDayTickets.has(key)) {
        technicianDayTickets.set(key, []);
      }
      technicianDayTickets.get(key)!.push(ticket);
    }

    // Check for conflicts within each technician's daily tickets
    const conflictingTicketIds = new Set<string>();

    for (const dayTickets of technicianDayTickets.values()) {
      for (let i = 0; i < dayTickets.length; i++) {
        const ticket1 = dayTickets[i];
        if (!ticket1.scheduled_date) continue;

        const start1 = new Date(ticket1.scheduled_date);
        const duration1 = ticket1.estimated_duration || 120;
        const end1 = new Date(start1.getTime() + duration1 * 60 * 1000);

        for (let j = i + 1; j < dayTickets.length; j++) {
          const ticket2 = dayTickets[j];
          if (!ticket2.scheduled_date) continue;

          const start2 = new Date(ticket2.scheduled_date);
          const duration2 = ticket2.estimated_duration || 120;
          const end2 = new Date(start2.getTime() + duration2 * 60 * 1000);

          // Check for overlap
          if (start1 < end2 && end1 > start2) {
            conflictingTicketIds.add(ticket1.id);
            conflictingTicketIds.add(ticket2.id);
          }
        }
      }
    }

    // Count conflicts by date
    for (const ticketId of conflictingTicketIds) {
      const ticket = tickets.find(t => t.id === ticketId);
      if (ticket?.scheduled_date) {
        const dateKey = new Date(ticket.scheduled_date).toISOString().split('T')[0];
        conflictsByDate.set(dateKey, (conflictsByDate.get(dateKey) || 0) + 1);
      }
    }

    return conflictsByDate;
  } catch (error) {
    console.error('Exception getting conflicts for date range:', error);
    return conflictsByDate;
  }
}
