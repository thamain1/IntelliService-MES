import { useEffect, useState } from 'react';
import { X, Factory } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ManufacturingService, CreateProductionOrderInput } from '../../services/ManufacturingService';

interface ProductionOrder {
  title?: string;
  description?: string;
  priority?: number;
  customer_id?: string;
  assigned_to?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  quantity_ordered?: number;
  ticket_id?: string;
}

interface ProductionOrderFormProps {
  order?: ProductionOrder;
  ticketId?: string;
  onClose: () => void;
  onSave: () => void;
}

interface Customer {
  id: string;
  name: string;
}

interface Profile {
  id: string;
  full_name: string;
}

export function ProductionOrderForm({ order, ticketId, onClose, onSave }: ProductionOrderFormProps) {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [formData, setFormData] = useState<CreateProductionOrderInput>({
    title: '',
    description: '',
    priority: 3,
    customer_id: '',
    assigned_to: '',
    scheduled_start: '',
    scheduled_end: '',
    quantity_ordered: 1,
    ticket_id: ticketId,
  });

  useEffect(() => {
    loadFormData();
    if (order) {
      setFormData({
        title: order.title || '',
        description: order.description || '',
        priority: order.priority || 3,
        customer_id: order.customer_id || '',
        assigned_to: order.assigned_to || '',
        scheduled_start: order.scheduled_start ? order.scheduled_start.split('T')[0] : '',
        scheduled_end: order.scheduled_end ? order.scheduled_end.split('T')[0] : '',
        quantity_ordered: order.quantity_ordered || 1,
        ticket_id: order.ticket_id,
      });
    }
  }, [order]);

  const loadFormData = async () => {
    try {
      const [customersRes, techsRes] = await Promise.all([
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('profiles').select('id, full_name').in('role', ['admin', 'dispatcher', 'technician']).order('full_name'),
      ]);

      setCustomers(customersRes.data || []);
      setTechnicians(techsRes.data || []);
    } catch (error) {
      console.error('Error loading form data:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    setLoading(true);
    try {
      const input: CreateProductionOrderInput = {
        ...formData,
        customer_id: formData.customer_id || undefined,
        assigned_to: formData.assigned_to || undefined,
        scheduled_start: formData.scheduled_start ? new Date(formData.scheduled_start).toISOString() : undefined,
        scheduled_end: formData.scheduled_end ? new Date(formData.scheduled_end).toISOString() : undefined,
      };

      if (ticketId) {
        await ManufacturingService.createFromTicket(ticketId, {
          priority: formData.priority,
          scheduled_start: formData.scheduled_start ? new Date(formData.scheduled_start).toISOString() : undefined,
          assigned_to: formData.assigned_to || undefined,
        });
      } else {
        await ManufacturingService.createOrder(input);
      }

      onSave();
    } catch (error) {
      console.error('Error saving order:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <Factory className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {order ? 'Edit Production Order' : 'New Production Order'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              placeholder="Enter order title"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              placeholder="Enter description (optional)"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Customer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Customer
              </label>
              <select
                value={formData.customer_id}
                onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select customer (optional)</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Assigned To */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Assigned To
              </label>
              <select
                value={formData.assigned_to}
                onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Unassigned</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value={1}>Critical</option>
                <option value={2}>High</option>
                <option value={3}>Normal</option>
                <option value={4}>Low</option>
                <option value={5}>Lowest</option>
              </select>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                value={formData.quantity_ordered}
                onChange={(e) => setFormData({ ...formData, quantity_ordered: Number(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Scheduled Start */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Scheduled Start
              </label>
              <input
                type="date"
                value={formData.scheduled_start}
                onChange={(e) => setFormData({ ...formData, scheduled_start: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Scheduled End */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Scheduled End
              </label>
              <input
                type="date"
                value={formData.scheduled_end}
                onChange={(e) => setFormData({ ...formData, scheduled_end: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.title.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : order ? 'Update Order' : 'Create Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
