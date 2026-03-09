'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  const router = useRouter();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [memberCount, setMemberCount] = useState(1);

  if (!isOpen) return null;

  const handleUpgrade = (plan: string, price: number) => {
    // Navigate to payment with plan details
    router.push(`/admin/payment?amount=${price}&plan=${plan}`);
  };

  const plans = [
    {
      name: 'Pro',
      description: 'For individuals and small groups looking to create more content',
      credits: '1,000 credits / month',
      priceMonthly: 24,
      priceAnnual: 16,
      recommended: true,
      features: [
        'Export without watermarks',
        'Upload files up to 6 GB',
        'Store and edit unlimited projects',
        'Export projects up to 2 hours long',
        'Export content in 4K resolution',
      ],
      usableFor: [
        'Auto-subtitling (up to 1,000 min / month)',
        'Dubbing (up to 50 min / month)',
        'Edit with AI (up to 30 times / month)',
        'Many more premium features. Learn More',
      ],
      buttonText: 'Upgrade to Pro',
    },
    {
      name: 'Business',
      description: 'For individuals and teams to supercharge their content workflow',
      credits: '4,000 credits / month',
      priceMonthly: 75,
      priceAnnual: 50,
      features: [
        'Create custom voice clones',
        'Lip sync videos',
        'Ability to purchase additional credits',
      ],
      usableFor: [
        'Auto-subtitling (up to 4,000 min / month)',
        'Dubbing (up to 200 min / month)',
        'Edit with AI (up to 200 times / month)',
        'Many more premium features. Learn More',
      ],
      buttonText: 'Upgrade to Business',
    },
    {
      name: 'Enterprise',
      description: 'For large organizations that need advanced controls and support',
      credits: 'Custom amount of credits',
      isEnterprise: true,
      features: [
        'Custom billing',
      ],
      usableFor: [
        'Auto-subtitling (up to a custom amount / month)',
        'Dubbing (up to a custom amount / month)',
        'Edit with AI (up to a custom amount / month)',
        'Many more premium features. Learn More',
      ],
      buttonText: 'Contact Sales',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-6xl shadow-2xl relative overflow-hidden animate-in fade-in zoom-in duration-300">
        {/* Header Section */}
        <div className="p-8 pb-0">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
          >
            <span className="material-icons text-2xl">close</span>
          </button>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
            <div className="space-y-1">
              <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Upgrade My Workspace</h2>
              <p className="text-lg text-gray-500">to export projects longer than 1 minute</p>
            </div>

            <div className="flex items-center gap-4 bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
              <div className="flex items-center gap-2 px-3">
                <select 
                  value={memberCount} 
                  onChange={(e) => setMemberCount(Number(e.target.value))}
                  className="bg-transparent font-bold text-gray-700 focus:outline-none cursor-pointer"
                >
                  {[1, 2, 3, 5, 10].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="text-gray-500 text-sm font-medium">member</span>
              </div>
              
              <div className="flex bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-6 py-2 text-sm font-bold transition-all ${
                    billingCycle === 'monthly' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Monthly Plan
                </button>
                <button
                  onClick={() => setBillingCycle('annual')}
                  className={`px-6 py-2 text-sm font-bold transition-all relative ${
                    billingCycle === 'annual' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Annual Plan
                  {billingCycle !== 'annual' && (
                    <span className="absolute -top-3 -right-2 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm whitespace-nowrap">
                      Save up to 33%
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="p-8 pt-0 grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col rounded-3xl border-2 transition-all p-8 relative ${
                plan.recommended 
                  ? 'border-rose-500 ring-4 ring-rose-500/10 bg-white' 
                  : 'border-gray-100 bg-gray-50/50 hover:border-gray-200'
              }`}
            >
              {plan.recommended && (
                <div className="absolute -top-4 right-6 bg-rose-500 text-white text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg shadow-rose-500/20">
                  Recommended
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-2xl font-black text-gray-900 mb-2">{plan.name}</h3>
                <p className="text-sm text-gray-500 leading-relaxed font-medium">{plan.description}</p>
              </div>

              <div className="mb-8">
                <div className="text-gray-900 text-lg font-bold mb-1">{plan.credits}</div>
                {!plan.isEnterprise && (
                  <div className="flex items-baseline gap-1">
                    <span className="text-gray-500 text-sm font-medium">{memberCount} member × </span>
                    <span className="text-gray-900 text-4xl font-black">${billingCycle === 'annual' ? plan.priceAnnual : plan.priceMonthly}</span>
                    <span className="text-gray-500 text-sm font-bold uppercase tracking-tighter">USD per month</span>
                  </div>
                )}
                {!plan.isEnterprise && (
                  <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wider">
                    paid {billingCycle === 'annual' ? 'annually' : 'monthly'}
                  </p>
                )}
                {plan.isEnterprise && (
                  <div className="mt-4">
                    <span className="material-icons text-5xl text-gray-300">business</span>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-8 mb-8">
                <div className="space-y-3">
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-[2px] mb-4">
                    Everything in {plan.name === 'Pro' ? 'Free' : plan.name === 'Business' ? 'Pro' : 'Business'}, plus:
                  </p>
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <span className="material-icons text-gray-400 text-sm mt-0.5">check</span>
                      <span className="text-sm text-gray-600 font-medium leading-tight">{feature}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 pt-6 border-t border-gray-100">
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-[2px] mb-4">Credits usable for:</p>
                  {plan.usableFor.map((use) => (
                    <div key={use} className="flex items-start gap-3">
                      <span className="material-icons text-gray-400 text-sm mt-0.5">check</span>
                      <span className="text-sm text-gray-600 font-medium leading-tight">
                        {use.includes('Learn More') ? (
                          <>
                            {use.replace('Learn More', '')}
                            <button className="text-gray-400 underline hover:text-gray-600 ml-1">Learn More</button>
                          </>
                        ) : use}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-auto space-y-4">
                {!plan.isEnterprise && plan.priceAnnual !== undefined && plan.priceMonthly !== undefined && (
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Total Due Today:</span>
                    <span className="text-sm font-black text-gray-900">
                      ${((billingCycle === 'annual' ? plan.priceAnnual * 12 : plan.priceMonthly) * memberCount).toLocaleString()} USD
                    </span>
                  </div>
                )}
                <button
                  onClick={() => {
                    if (!plan.isEnterprise && plan.priceAnnual !== undefined && plan.priceMonthly !== undefined) {
                      const finalPrice = billingCycle === 'annual' ? plan.priceAnnual * 12 : plan.priceMonthly;
                      handleUpgrade(plan.name, finalPrice * memberCount);
                    }
                  }}
                  className={`w-full py-4 rounded-2xl text-base font-black transition-all active:scale-[0.98] shadow-lg ${
                    plan.recommended
                      ? 'bg-gray-900 text-white hover:bg-black shadow-gray-200'
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300 shadow-transparent'
                  }`}
                >
                  {plan.buttonText}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-100 text-center">
          <p className="text-[10px] text-gray-400 font-medium px-12 leading-relaxed">
            By upgrading, you understand the subscription will auto-renew until cancelled. You agree to our 
            <button className="mx-1 underline hover:text-gray-600">Terms of Service</button> and 
            <button className="mx-1 underline hover:text-gray-600">Refund Policy</button>. 
            Learn more about our <button className="underline hover:text-gray-600">pricing here</button>.
          </p>
        </div>
      </div>
    </div>
  );
}
