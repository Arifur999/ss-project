import React from 'react'
import { useLang } from '../../context/LanguageContext'
import { SUPPORT_NUMBER } from '../../lib/support'
import LegalPage, { type LegalSection } from './LegalPage'

// How to have a Furnify account and its data deleted - the page the app
// stores ask for, so someone can request it without the app installed. The
// steps match the app's own Delete account screen.

const UPDATED = '8 October 2026'

const COPY: Record<'en' | 'bn', { title: string; updated: string; intro: string; sections: LegalSection[] }> = {
  en: {
    title: 'Delete your Furnify account',
    updated: `Last updated: ${UPDATED}`,
    intro: 'You can ask us to delete your Furnify account and its data at any time, in any of these ways.',
    sections: [
      {
        heading: 'How to ask',
        body: [
          [
            'In the Android app: More → Delete account → Request deletion.',
            'On the website: Support → New ticket, with the subject "Delete my account".',
            `By WhatsApp or phone: ${SUPPORT_NUMBER}, from the number or with the email address on the account.`,
          ],
          'We check that the request comes from the account holder before deleting anything.',
        ],
      },
      {
        heading: 'What is deleted',
        body: [
          [
            'If you are the owner: the whole business - every record (products, stock, purchases, sales, customers, suppliers, accounts, expenses, loans, employees) and every team member\'s login.',
            'If you are a team member: your login only. The business records belong to the owner and stay with them.',
          ],
          'Deletion cannot be undone. If you want a copy of your records, download your reports before you ask.',
        ],
      },
      {
        heading: 'How long it takes',
        body: [
          'We complete a deletion within 30 days of confirming it. Billing records we are required to keep by law may be kept for that period only, and are then deleted too.',
        ],
      },
    ],
  },
  bn: {
    title: 'Furnify অ্যাকাউন্ট মুছে ফেলুন',
    updated: `সর্বশেষ হালনাগাদ: ${UPDATED}`,
    intro: 'যেকোনো সময় Furnify অ্যাকাউন্ট আর তার তথ্য মুছে ফেলার অনুরোধ করতে পারেন, নিচের যেকোনো উপায়ে।',
    sections: [
      {
        heading: 'কীভাবে অনুরোধ করবেন',
        body: [
          [
            'Android অ্যাপে: আরও → অ্যাকাউন্ট মুছুন → মুছে ফেলার অনুরোধ।',
            'ওয়েবসাইটে: সাপোর্ট → নতুন টিকিট, বিষয় "Delete my account"।',
            `WhatsApp বা ফোনে: ${SUPPORT_NUMBER}, অ্যাকাউন্টের নম্বর থেকে বা অ্যাকাউন্টের ইমেইল জানিয়ে।`,
          ],
          'কিছু মোছার আগে আমরা নিশ্চিত হই যে অনুরোধটি অ্যাকাউন্টের মালিকের কাছ থেকেই এসেছে।',
        ],
      },
      {
        heading: 'কী মুছে যাবে',
        body: [
          [
            'আপনি মালিক হলে: পুরো ব্যবসা - সব হিসাব (পণ্য, স্টক, কেনা, বিক্রি, কাস্টমার, সাপ্লায়ার, অ্যাকাউন্ট, খরচ, লোন, কর্মচারী) আর টিমের সবার লগইন।',
            'আপনি টিমের সদস্য হলে: শুধু আপনার লগইন। ব্যবসার হিসাব মালিকের, তা মালিকের কাছেই থাকবে।',
          ],
          'মুছে ফেলা আর ফেরত আনা যায় না। হিসাবের কপি রাখতে চাইলে অনুরোধের আগে রিপোর্টগুলো নামিয়ে রাখুন।',
        ],
      },
      {
        heading: 'কতদিন লাগে',
        body: ['নিশ্চিত হওয়ার পর ৩০ দিনের মধ্যে মুছে ফেলা শেষ হয়। আইন অনুযায়ী যে বিলের হিসাব রাখতে হয়, শুধু সেটুকু সেই সময় পর্যন্ত রাখা হতে পারে, তারপর সেটাও মুছে যায়।'],
      },
    ],
  },
}

export default function AccountDeletion() {
  const { lang } = useLang()
  const copy = COPY[lang === 'bn' ? 'bn' : 'en']
  return <LegalPage title={copy.title} updated={copy.updated} intro={copy.intro} sections={copy.sections} />
}
