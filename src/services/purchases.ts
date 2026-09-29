import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type PurchasesPackage } from 'react-native-purchases';
import { isUsableRevenueCatKey, isUsableRevenueCatTestKey } from '../lib/configuration';

const PLUS_ENTITLEMENT_ID = 'beseen_plus';

const productionApiKey = Platform.OS === 'ios'
  ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
  : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
const testApiKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
const testStoreRequested = __DEV__ || process.env.EXPO_PUBLIC_REVENUECAT_TEST_MODE === 'true';
const useTestStore = testStoreRequested && isUsableRevenueCatTestKey(testApiKey);
const apiKey = useTestStore ? testApiKey : productionApiKey;
const usableApiKey = useTestStore || isUsableRevenueCatKey(productionApiKey, Platform.OS === 'ios' ? 'ios' : 'android');

let configured = false;
let currentAppUserId: string | undefined;

export function isRevenueCatConfigured() {
  return usableApiKey;
}

export async function configurePurchases(appUserId?: string) {
  if (!apiKey || !usableApiKey) return false;
  if (!configured) {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
    Purchases.configure({ apiKey, appUserID: appUserId });
    configured = true;
    currentAppUserId = appUserId;
  } else if (appUserId && currentAppUserId !== appUserId) {
    await Purchases.logIn(appUserId);
    currentAppUserId = appUserId;
  }
  return true;
}

export async function disconnectPurchases() {
  if (!configured || !currentAppUserId) return;
  await Purchases.logOut();
  currentAppUserId = undefined;
}

export async function getPlusPackage() {
  if (!configured) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current?.monthly ?? offerings.current?.availablePackages[0] ?? null;
}

export async function buyPlus(aPackage: PurchasesPackage) {
  const result = await Purchases.purchasePackage(aPackage);
  return Boolean(result.customerInfo.entitlements.active[PLUS_ENTITLEMENT_ID]);
}

export function isPurchaseCancelled(reason: unknown) {
  if (!reason || typeof reason !== 'object') return false;
  const purchaseError = reason as { code?: string; userCancelled?: boolean | null };
  return purchaseError.userCancelled === true || purchaseError.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
}

export async function restorePlus() {
  const info = await Purchases.restorePurchases();
  return Boolean(info.entitlements.active[PLUS_ENTITLEMENT_ID]);
}
