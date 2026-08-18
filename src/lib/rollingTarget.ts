/**
 * Rolling Equal Daily Target Engine
 *
 * মাসের প্রতিটি দিন তিন ভাগের একটায় পড়ে:
 *
 * 1. শেষ হয়ে যাওয়া দিন — সেদিন সকালে যে target দাঁড়িয়েছিল সেটাই লক করা থাকে।
 *    History কখনো নড়ে না।
 *
 * 2. চলতি দিন (আজ) — আজ সকালে যে target দাঁড়িয়েছিল, সারাদিন সেটাই থাকে:
 *
 *        (Monthly Target − গতকাল পর্যন্ত মোট Sales) ÷ (আজ সহ বাকি দিন)
 *
 *    আজ যত বিক্রিই হোক, আজকের নিজের target নড়ে না — ওটাই তো আজ কতটা করার
 *    কথা ছিল তার হিসাব।
 *
 * 3. আজকের পরের সব দিন — আজকেরটার সাথে হুবহু একই সংখ্যা:
 *
 *        (Monthly Target − মাসের মোট Sales) ÷ (আজ সহ যত দিন এখনো শেষ হয়নি)
 *
 *    মাসের আর ১০ দিন বাকি আর ১,০০,০০০ টাকা বাকি মানে দশটা দিনই ১০,০০০ দেখায়।
 *    কোনো দিন বেশি বিক্রি হলে বাকি সবগুলো একসাথে নেমে যায়, কম হলে একসাথে উঠে
 *    যায়, আর পুরো মাসের target একদিনেই তুলে ফেললে বাকি সব দিন 0 হয়ে যায়।
 *
 *    আগে আজকের ভাজকে আজ গোনা হতো কিন্তু আগামী দিনের ভাজকে আজ বাদ পড়ত, তাই
 *    ঐ ১০ দিনে আজ দেখাত ১০,০০০ আর বাকি ন'দিন ১১,১১১ — একই বাকি টাকার জন্য দুই
 *    রকম সংখ্যা।
 *
 * হিসাব সবসময় Monthly Target আর কাঁচা daily sales থেকে নতুন করে হয়। আগের
 * daily target, আগের remaining target বা অন্য কোনো cached মান কখনো ব্যবহার
 * করা হয় না — ফাংশনটা pure, তাই প্রতিটা Sales add / update / delete-এর পরে
 * শুধু আবার কল করলেই সব upcoming day-এর target একসাথে ঠিক হয়ে যায়।
 */

export interface DailySalesMap {
  [day: number]: number;
}

export interface RollingTargetConfig {
  monthlyTarget: number;
  year: number;
  month: number; // 1 = January, 12 = December

  /**
   * প্রতিদিনের actual sales।
   *
   * Example:
   * {
   *   1: 32000,
   *   2: 10000,
   *   3: 0
   * }
   */
  dailySalesMap: DailySalesMap;

  /**
   * সর্বশেষ শেষ হয়ে যাওয়া day।
   *
   * কোনো দিন sales 0 হলেও দিনটি শেষ হলে এখানে day number দিতে হবে।
   *
   * Example:
   * Day 1 শেষ হলে: 1
   * Day 2 শেষ হলে: 2
   * মাস এখনো শুরু না হলে: 0
   */
  completedThroughDay: number;

  /**
   * চলতি দিন — অর্থাৎ `completedThroughDay + 1`।
   *
   * মাসটা অতীতের (সব দিন শেষ) বা ভবিষ্যতের (এখনো শুরুই হয়নি) হলে 0।
   * অন্য কোনো মান দিলে চলতি দিন নেই ধরে নেওয়া হয়।
   */
  inProgressDay?: number;
}

export interface DailyTargetRecord {
  day: number;
  dateString: string;
  /** completed = দিন শেষ। current = আজ। upcoming = আজকের পরে। */
  status: "completed" | "current" | "upcoming";
  openingTarget: number;
  actualSales: number;
  remainingTargetAfterSales: number;
}

export interface RollingTargetSummary {
  monthlyTarget: number;
  totalDaysInMonth: number;
  completedThroughDay: number;
  /** চলতি দিন, না থাকলে 0। */
  inProgressDay: number;
  /** মাসে রেকর্ড হওয়া মোট sales। */
  totalSales: number;
  /** Monthly Target − মাসের মোট sales (0-এর নিচে নামে না)। */
  remainingTarget: number;
  /** আজকের পরে আর কয়টা দিন বাকি। */
  remainingDays: number;
  /** আজকের নিজের target। */
  currentDailyTarget: number;
  /** আজকের পরের প্রতিটি দিনের target — সবগুলো হুবহু এক। */
  upcomingDailyTarget: number;
  dailyRecords: DailyTargetRecord[];
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

/** যেকোনো ইনপুটকে নিরাপদ non-negative সংখ্যায় নামায় (NaN / null / ঋণাত্মক → 0)। */
function positive(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

export function getDaysInMonth(
  year: number,
  month: number
): number {
  if (!Number.isFinite(year) || !Number.isFinite(month)) return 0;
  const days = new Date(year, month, 0).getDate();
  return Number.isFinite(days) ? days : 0;
}

export function calculateRollingTargets(
  config: RollingTargetConfig
): RollingTargetSummary {
  const { year, month, dailySalesMap } = config;

  const totalDaysInMonth = getDaysInMonth(year, month);
  const monthlyTarget = positive(config.monthlyTarget);

  const completedThroughDay = Math.min(
    totalDaysInMonth,
    Math.floor(positive(config.completedThroughDay))
  );

  /*
   * চলতি দিন শেষ completed দিনের ঠিক পরেরটাই হতে পারে। অন্য কিছু এলে (অতীত
   * মাস, ভবিষ্যৎ মাস, বা ভুল ইনপুট) ধরে নেওয়া হয় এই মাসে চলতি দিন নেই।
   */
  const requestedInProgressDay = Math.floor(
    positive(config.inProgressDay)
  );
  const isRealInProgressDay =
    requestedInProgressDay === completedThroughDay + 1 &&
    requestedInProgressDay <= totalDaysInMonth;

  const salesOn = (day: number) => positive(dailySalesMap[day]);

  /*
   * কোন দিন পর্যন্ত হিসাব "বন্ধ" ধরা হবে।
   *
   * ক্যালেন্ডার যতদূর গেছে সেটা তো বটেই, তার সাথে যেদিন পর্যন্ত বিক্রি বসানো
   * আছে সেদিন পর্যন্তও। কারণ যেদিনে বিক্রি হয়ে গেছে সেদিনের target আর নড়া
   * উচিত নয় — নাহলে "ঐ দিনে target কত ছিল আর বিক্রি কত হলো" মেলানো যায় না।
   * এতে ভবিষ্যতের মাসে আগাম বসানো বিক্রিও ঠিক জায়গায় বসে।
   */
  let lastDayWithSales = 0;
  for (let day = 1; day <= totalDaysInMonth; day++) {
    if (salesOn(day) > 0) lastDayWithSales = day;
  }

  const settledThroughDay = Math.max(
    completedThroughDay,
    lastDayWithSales
  );

  // আজকের দিনে বিক্রি বসে গেলে দিনটা উপরের walk-এ লক হয়ে যাবে, তখন আলাদা
  // "current" record লাগে না।
  const inProgressDay =
    isRealInProgressDay &&
    requestedInProgressDay > settledThroughDay
      ? requestedInProgressDay
      : 0;

  let remainingTarget = monthlyTarget;
  let totalSales = 0;

  const dailyRecords: DailyTargetRecord[] = [];

  /*
   * ১. বন্ধ হয়ে যাওয়া দিন।
   *
   * প্রতিটি দিনের শুরুতে তখনকার remaining target তখনকার remaining days দিয়ে
   * ভাগ হয়। মানটা ওখানেই লক হয়ে যায়, তাই chart-এর history কখনো নড়ে না।
   */
  for (let day = 1; day <= settledThroughDay; day++) {
    const daysLeftFromThisDay =
      totalDaysInMonth - day + 1;

    const openingTarget =
      daysLeftFromThisDay > 0
        ? remainingTarget / daysLeftFromThisDay
        : 0;

    const actualSales = salesOn(day);

    totalSales += actualSales;

    remainingTarget = Math.max(
      0,
      remainingTarget - actualSales
    );

    dailyRecords.push({
      day,
      dateString: createDateString(year, month, day),
      status: "completed",
      openingTarget: roundMoney(openingTarget),
      actualSales: roundMoney(actualSales),
      remainingTargetAfterSales:
        roundMoney(remainingTarget),
    });
  }

  /*
   * ২. চলতি দিন — শুধু তখনই, যখন আজকের দিনে এখনো কোনো বিক্রি বসেনি। বিক্রি
   *    থাকলে আজকের দিনটা উপরের walk-এই লক হয়ে গেছে।
   *
   * আজকের target আজ সকালের remaining দিয়েই ঠিক হয়, তাই সারাদিন বিক্রি করলেও
   * আজকের বারটা এক জায়গায় দাঁড়িয়ে থাকে — আপনি দেখতে পান আজ কতটা করার কথা
   * ছিল বনাম কতটা হলো।
   */
  const openDays = totalDaysInMonth - settledThroughDay;

  const currentDailyTarget =
    openDays > 0 ? remainingTarget / openDays : 0;

  if (inProgressDay > 0) {
    dailyRecords.push({
      day: inProgressDay,
      dateString: createDateString(
        year,
        month,
        inProgressDay
      ),
      status: "current",
      openingTarget: roundMoney(currentDailyTarget),
      actualSales: 0,
      remainingTargetAfterSales:
        roundMoney(remainingTarget),
    });
  }

  /*
   * ৩. বাকি সব দিন — আজকেরটার সাথে হুবহু একই সংখ্যা।
   *
   * মালিকের কথায়: "aie maser r 10 din baki, target ase 100000 / 10 diner. jodi
   * kno din besi sells hoy tahole SOV GULAR target kome jabe, jodi kom sells hoy
   * tahole bere jabe."
   *
   * অর্থাৎ যে দিনগুলো এখনো শেষ হয়নি — আজ সহ — সবগুলোর target একই, আর সেই এক
   * সংখ্যাটাই বিক্রির সাথে সাথে একসাথে ওঠে-নামে:
   *
   *     যা বাকি ÷ (আজ সহ যত দিন এখনো শেষ হয়নি)
   *
   * এখানে ভুলটা ছিল ভাজকে। আজকের হিসাবে আজকের দিনটা গোনা হতো (openDays), কিন্তু
   * আগামী দিনগুলোর হিসাবে আজ বাদ পড়ত (remainingDays) — তাই ১০ দিনে ১,০০,০০০
   * থাকলে আজ দেখাত ১০,০০০ আর বাকি ন'দিন দেখাত ১১,১১১। একই মাসের একই বাকি টাকার
   * জন্য দুই রকম সংখ্যা।
   *
   * এখন দুটোই currentDailyTarget, তাই দশটা দিনই ১০,০০০ দেখায়। আগামীকাল দিনটা
   * বন্ধ হয়ে গেলে ভাজক নিজে থেকেই ন'তে নামে এবং গোটা সারি একসাথে নতুন মানে বসে।
   */
  const upcomingDailyTarget = currentDailyTarget;

  const remainingDays = Math.max(
    0,
    totalDaysInMonth - Math.max(settledThroughDay, inProgressDay)
  );

  const firstUpcomingDay =
    Math.max(settledThroughDay, inProgressDay) + 1;

  for (
    let day = firstUpcomingDay;
    day <= totalDaysInMonth;
    day++
  ) {
    dailyRecords.push({
      day,
      dateString: createDateString(year, month, day),
      status: "upcoming",
      openingTarget: roundMoney(upcomingDailyTarget),
      actualSales: roundMoney(salesOn(day)),
      remainingTargetAfterSales:
        roundMoney(remainingTarget),
    });
  }

  return {
    monthlyTarget: roundMoney(monthlyTarget),
    totalDaysInMonth,
    completedThroughDay,
    inProgressDay,
    totalSales: roundMoney(totalSales),
    remainingTarget: roundMoney(remainingTarget),
    remainingDays,
    currentDailyTarget:
      roundMoney(currentDailyTarget),
    upcomingDailyTarget:
      roundMoney(upcomingDailyTarget),
    dailyRecords,
  };
}

function createDateString(
  year: number,
  month: number,
  day: number
): string {
  return [
    year,
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}
