'use client';

import { useState, useEffect } from 'react';
import { X, Send, Mail } from 'lucide-react';
import { useHelpCenterStore } from '@/lib/stores/helpCenterStore';
import { useAuthStore } from '@/lib/stores/authStore';

export default function HelpCenterModal() {
  const { isOpen, closeModal } = useHelpCenterStore();
  const { user } = useAuthStore();

  // Contact form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    message: '',
  });

  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  // Pre-fill form with user data when modal opens
  useEffect(() => {
    if (isOpen && user) {
      setFormData(prev => ({
        ...prev,
        name: (user as any).name || '',
        email: user.email || '',
      }));
    }
  }, [isOpen, user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');

    try {
      // Call backend API to send contact form email
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/contact/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to send message');
      }

      // Success - show confirmation and reset form
      setStatus('success');
      setFormData({
        name: (user as any)?.name || '',
        email: user?.email || '',
        company: '',
        phone: '',
        message: ''
      });

      // Reset status and close modal after 3 seconds
      setTimeout(() => {
        setStatus('idle');
        closeModal();
      }, 3000);
    } catch (error) {
      console.error('Failed to send contact form:', error);
      setStatus('error');

      // Reset error status after 5 seconds
      setTimeout(() => setStatus('idle'), 5000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-2 md:right-4 top-20 bottom-4 w-[calc(100%-16px)] md:w-[500px] bg-card border border-border rounded-lg shadow-2xl z-40 flex flex-col animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="text-primary w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Contact Support</h2>
            <p className="text-xs text-muted-foreground">We'll respond within 24 hours</p>
          </div>
        </div>
        <button
          onClick={closeModal}
          className="p-2 rounded-lg hover:bg-muted transition-all duration-200"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Contact Form */}
      <div className="flex-1 overflow-y-auto p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-foreground mb-2">
              Full Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              className="w-full px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all bg-background text-foreground"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-foreground mb-2">
              Email Address *
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all bg-background text-foreground"
              placeholder="john@company.com"
            />
          </div>

          <div>
            <label htmlFor="company" className="block text-sm font-semibold text-foreground mb-2">
              Company Name
            </label>
            <input
              type="text"
              id="company"
              name="company"
              value={formData.company}
              onChange={handleChange}
              className="w-full px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all bg-background text-foreground"
              placeholder="Your Company Inc."
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-semibold text-foreground mb-2">
              Phone Number
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all bg-background text-foreground"
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div>
            <label htmlFor="message" className="block text-sm font-semibold text-foreground mb-2">
              Message *
            </label>
            <textarea
              id="message"
              name="message"
              required
              value={formData.message}
              onChange={handleChange}
              rows={5}
              className="w-full px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all resize-none bg-background text-foreground"
              placeholder="Tell us how we can help..."
            />
          </div>

          <button
            type="submit"
            disabled={status === 'sending'}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-3 rounded-lg font-semibold text-base transition-all duration-300 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {status === 'sending' ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                Sending...
              </>
            ) : status === 'success' ? (
              <>✓ Message Sent!</>
            ) : status === 'error' ? (
              <>✗ Failed - Please try again</>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Message
              </>
            )}
          </button>

          {status === 'success' && (
            <div className="text-sm mt-2 text-center bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 p-4 rounded-lg">
              <p className="font-semibold text-green-800 dark:text-green-100">Thank you for reaching out!</p>
              <p className="mt-1 text-green-700 dark:text-green-200">We've received your message and will respond within 24 hours. Check your email for confirmation.</p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-sm mt-2 text-center bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-4 rounded-lg">
              <p className="font-semibold text-red-800 dark:text-red-100">Failed to send message</p>
              <p className="mt-1 text-red-700 dark:text-red-200">Please try again or email us directly at support@priceiq.org</p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
