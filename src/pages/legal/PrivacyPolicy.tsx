import React from 'react'
import { useLang } from '../../context/LanguageContext'
import { SUPPORT_NUMBER } from '../../lib/support'
import LegalPage, { type LegalSection } from './LegalPage'

// The privacy policy the app stores link to, for the website and the Android
// app alike. It says only what the system does: what is collected, where it
// goes, how long it stays and how it is deleted. Review it before publishing
// and whenever what the app collects changes.

const UPDATED = '8 October 2026'

const COPY: Record<'en' | 'bn', { title: string; updated: string; intro: string; sections: LegalSection[] }> = {
  en: {
    title: 'Privacy Policy',
    updated: `Last updated: ${UPDATED}`,
    intro:
      'Furnify is a business management service for furniture shops - sales, purchases, stock, customers, suppliers, accounts and staff - used on the website and in the Furnify Android app. This policy explains what information we hold, why, and what you can do about it.',
    sections: [
      {
        heading: 'What we collect',
        body: [
          [
            'Your account: your name, email address, phone number and a password (stored only as a one-way hash).',
            'Your business details: the business name, address, phone and logo you enter.',
            'The records you keep in Furnify: products, prices and stock, purchases and suppliers, sales and invoices, customers (names, phones and addresses), payments, expenses, loans, employees, salaries and attendance.',
            'Messages you send to support, and the SMS you send to your customers through Furnify.',
          ],
          'In the Android app, your sign-in is kept in the phone\'s secure storage. Photos are read only when you choose one for a product or your logo, and a price file only when you choose it. The app does not read your location, contacts or microphone.',
        ],
      },
      {
        heading: 'How we use it',
        body: [
          [
            'To run the service you signed up for: storing your records and working out your figures and reports.',
            'To sign you in safely, including the one-time codes we email you.',
            'To send the messages you ask us to send - verification codes, reports to your email, SMS to your customers.',
            'To answer you when you contact support.',
          ],
          'We do not sell your information, and we do not show advertising.',
        ],
      },
      {
        heading: 'Who else handles it',
        body: [
          'A few providers handle data for us, only to provide the service:',
          [
            'Our hosting provider, whose servers keep the service and its database.',
            'An email delivery service, for codes and reports.',
            'An SMS gateway, for the messages you send to your customers.',
            'An image hosting service, for product photos and logos.',
            'The payment provider, when you pay for a plan or SMS on the website. We do not store wallet or card credentials.',
          ],
          'Each business\'s records are kept separate: no other shop can see yours.',
        ],
      },
      {
        heading: 'How long we keep it, and deleting it',
        body: [
          'We keep your records while your account is open, so your history and reports stay complete.',
          'You can ask us to delete your account at any time - see the Account deletion page. An owner\'s request deletes the whole business: its records and every team login. A team member\'s request removes that login. We complete a deletion within 30 days; billing records we are required to keep by law may be kept for that period only.',
        ],
      },
      {
        heading: 'Keeping it safe',
        body: [
          'Everything travels over an encrypted connection. Passwords are hashed, sign-in needs an emailed code, and every request is checked against the business it belongs to.',
        ],
      },
      {
        heading: 'Children',
        body: ['Furnify is for businesses and is not meant for anyone under 18.'],
      },
      {
        heading: 'Changes and contact',
        body: [
          'If this policy changes, the date at the top changes with it.',
          `Questions about your information: use Support in the app or on the website, or WhatsApp / call ${SUPPORT_NUMBER}.`,
        ],
      },
    ],
  },
  bn: {
    title: 'গোপনীয়তা নীতি',
    updated: `সর্বশেষ হালনাগাদ: ${UPDATED}`,
    intro:
      'Furnify হলো ফার্নিচারের দোকানের ব্যবসা পরিচালনার একটি সেবা - বিক্রি, কেনা, স্টক, কাস্টমার, সাপ্লায়ার, হিসাব আর কর্মচারী - যা ওয়েবসাইটে আর Furnify Android অ্যাপে ব্যবহার করা হয়। এই নীতিতে বলা আছে আমরা কী তথ্য রাখি, কেন রাখি, আর আপনি কী করতে পারেন।',
    sections: [
      {
        heading: 'আমরা কী তথ্য নিই',
        body: [
          [
            'আপনার অ্যাকাউন্ট: নাম, ইমেইল, ফোন নম্বর আর পাসওয়ার্ড (শুধু একমুখী hash হিসেবে রাখা হয়)।',
            'আপনার ব্যবসার তথ্য: ব্যবসার নাম, ঠিকানা, ফোন আর লোগো, যা আপনি দেন।',
            'Furnify-তে আপনার রাখা হিসাব: পণ্য, দাম ও স্টক, কেনা ও সাপ্লায়ার, বিক্রি ও ইনভয়েস, কাস্টমার (নাম, ফোন, ঠিকানা), পেমেন্ট, খরচ, লোন, কর্মচারী, বেতন আর হাজিরা।',
            'সাপোর্টে পাঠানো বার্তা, আর Furnify দিয়ে কাস্টমারদের পাঠানো SMS।',
          ],
          'Android অ্যাপে আপনার সাইন-ইন ফোনের সুরক্ষিত জায়গায় রাখা হয়। ছবি শুধু তখনই পড়া হয় যখন আপনি কোনো পণ্য বা লোগোর জন্য বাছেন, আর দামের ফাইল শুধু যখন আপনি বাছেন। অ্যাপ আপনার লোকেশন, কন্টাক্ট বা মাইক্রোফোন পড়ে না।',
        ],
      },
      {
        heading: 'আমরা কীভাবে ব্যবহার করি',
        body: [
          [
            'আপনি যে সেবা নিয়েছেন তা চালাতে: আপনার হিসাব রাখা আর হিসাব ও রিপোর্ট তৈরি করা।',
            'নিরাপদে সাইন-ইন করাতে, ইমেইলে পাঠানো এককালীন কোডসহ।',
            'আপনি যা পাঠাতে বলেন তা পাঠাতে - যাচাইয়ের কোড, ইমেইলে রিপোর্ট, কাস্টমারদের SMS।',
            'সাপোর্টে যোগাযোগ করলে উত্তর দিতে।',
          ],
          'আমরা আপনার তথ্য বিক্রি করি না, আর কোনো বিজ্ঞাপন দেখাই না।',
        ],
      },
      {
        heading: 'আর কারা এই তথ্য নিয়ে কাজ করে',
        body: [
          'সেবা দেওয়ার জন্য কয়েকটি প্রতিষ্ঠান আমাদের হয়ে তথ্য নিয়ে কাজ করে:',
          [
            'আমাদের হোস্টিং প্রতিষ্ঠান, যার সার্ভারে সেবা আর ডাটাবেস থাকে।',
            'ইমেইল পাঠানোর সেবা, কোড আর রিপোর্টের জন্য।',
            'SMS গেটওয়ে, কাস্টমারদের পাঠানো বার্তার জন্য।',
            'ছবি রাখার সেবা, পণ্যের ছবি আর লোগোর জন্য।',
            'ওয়েবসাইটে প্ল্যান বা SMS-এর টাকা দিলে পেমেন্ট প্রতিষ্ঠান। আমরা ওয়ালেট বা কার্ডের তথ্য রাখি না।',
          ],
          'প্রতিটি ব্যবসার হিসাব আলাদা রাখা হয়: অন্য কোনো দোকান আপনার হিসাব দেখতে পারে না।',
        ],
      },
      {
        heading: 'কতদিন রাখি, আর মুছে ফেলা',
        body: [
          'অ্যাকাউন্ট খোলা থাকা পর্যন্ত আমরা আপনার হিসাব রাখি, যাতে ইতিহাস আর রিপোর্ট সম্পূর্ণ থাকে।',
          'যেকোনো সময় অ্যাকাউন্ট মুছে ফেলার অনুরোধ করতে পারেন - অ্যাকাউন্ট মুছে ফেলা পেজ দেখুন। মালিকের অনুরোধে পুরো ব্যবসা মুছে যায়: সব হিসাব আর টিমের সব লগইন। টিমের কারো অনুরোধে শুধু তার লগইন মুছে যায়। ৩০ দিনের মধ্যে মুছে ফেলা শেষ করা হয়; আইন অনুযায়ী যে বিলের হিসাব রাখতে হয়, শুধু সেটুকু সেই সময় পর্যন্ত রাখা হতে পারে।',
        ],
      },
      {
        heading: 'নিরাপত্তা',
        body: ['সবকিছু এনক্রিপ্ট করা সংযোগে যায়। পাসওয়ার্ড hash করা থাকে, সাইন-ইনে ইমেইল কোড লাগে, আর প্রতিটি অনুরোধ তার ব্যবসার সাথে মিলিয়ে দেখা হয়।'],
      },
      {
        heading: 'শিশু',
        body: ['Furnify ব্যবসার জন্য, ১৮ বছরের কম বয়সী কারো জন্য নয়।'],
      },
      {
        heading: 'পরিবর্তন ও যোগাযোগ',
        body: [
          'এই নীতি বদলালে উপরের তারিখও বদলে যাবে।',
          `আপনার তথ্য নিয়ে প্রশ্ন থাকলে: অ্যাপ বা ওয়েবসাইটের সাপোর্ট ব্যবহার করুন, অথবা WhatsApp / কল করুন ${SUPPORT_NUMBER}।`,
        ],
      },
    ],
  },
}

export default function PrivacyPolicy() {
  const { lang } = useLang()
  const copy = COPY[lang === 'bn' ? 'bn' : 'en']
  return <LegalPage title={copy.title} updated={copy.updated} intro={copy.intro} sections={copy.sections} />
}
