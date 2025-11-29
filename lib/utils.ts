// Utility functions for the application
import type { Order, OrderJob, Client } from './types';

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function calculateLineTotal(job: OrderJob): number {
  const baseTotal = job.quantity * job.unitPrice;
  const markupAmount = baseTotal * (job.lineMarkup / 100);
  return baseTotal + markupAmount;
}

export function calculateOrderSubtotal(jobs: OrderJob[]): number {
  return jobs.reduce((sum, job) => sum + calculateLineTotal(job), 0);
}

export function calculateOrderTax(subtotal: number, taxRate: number): number {
  return subtotal * (taxRate / 100);
}

export function calculateOrderTotal(order: Order): number {
  const subtotal = calculateOrderSubtotal(order.jobs);
  const tax = calculateOrderTax(subtotal, order.taxRate);
  return subtotal + tax;
}

export function getOrderTotals(order: Order) {
  const subtotal = calculateOrderSubtotal(order.jobs);
  const tax = calculateOrderTax(subtotal, order.taxRate);
  const total = subtotal + tax;
  
  return {
    subtotal,
    tax,
    total,
  };
}

export function generateOrderId(prefix: string = 'ORD'): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${year}-${random}`;
}

export function generateId(prefix: string = 'item'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function getClientOrders(orders: Order[], clientId: string): Order[] {
  return orders.filter(order => order.clientId === clientId);
}

export function getClientLifetimeValue(orders: Order[], clientId: string): number {
  const clientOrders = getClientOrders(orders, clientId);
  return clientOrders.reduce((sum, order) => {
    if (order.status === 'completed' || order.status === 'billed') {
      return sum + calculateOrderTotal(order);
    }
    return sum;
  }, 0);
}

export function getClientLastOrderDate(orders: Order[], clientId: string): Date | null {
  const clientOrders = getClientOrders(orders, clientId);
  if (clientOrders.length === 0) return null;
  
  return clientOrders.reduce((latest, order) => {
    return order.createdAt > latest ? order.createdAt : latest;
  }, clientOrders[0].createdAt);
}
