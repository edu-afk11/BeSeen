import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Linking,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { configurationError, isBackendConfigured, supabase } from './src/lib/supabase';
import { handleAuthCallback, resendSignupConfirmation, resetPassword as sendPasswordReset, signIn, signOut, signUp } from './src/services/auth';
import { createProfile, getCurrentProfile, isAdult, normalizeUsername, requestAccountDeletion, updateCity, updateDiscoveryPreferences, updateUsername, type DiscoveryCategory, type DiscoveryPreference } from './src/services/profile';
import { acceptCityPostResponse, createCityPost, listCityPostResponses, listCityPosts, reportCityPost, respondToCityPost } from './src/services/cityChat';
import { getLatestOutfit, getOutfitChangeAllowance, getTemporaryOutfitUrl, uploadOutfit } from './src/services/outfits';
import { activateStreetMode, deactivateStreetMode, findRecentEncounters, getActiveStreetSession, getStreetModeAllowance, refreshStreetLocation, requestInteraction } from './src/services/streetMode';
import { getInitialNotificationDestination, onNotificationOpened, registerPushNotifications, unregisterPushNotifications } from './src/services/notifications';
import type { PurchasesPackage } from 'react-native-purchases';
import { buyPlus, configurePurchases, disconnectPurchases, getPlusPackage, isPurchaseCancelled, isRevenueCatConfigured, restorePlus } from './src/services/purchases';
import { getIdentityStatus, startIdentityVerification, type IdentityStatus } from './src/services/identity';
import { blockEncounter, reportEncounter } from './src/services/safety';
import { isRecoveryCallbackUrl } from './src/lib/validation';
import { getMatch, listMyMatches, type MatchSummary } from './src/services/matches';
import { relativeTime, remainingTime } from './src/lib/validation';
import { recordCoreConsent } from './src/services/consent';

type Screen = 'welcome' | 'auth' | 'resetPassword' | 'onboarding' | 'home' | 'outfit' | 'nearby' | 'cityChat' | 'match' | 'matches' | 'settings' | 'premium' | 'privacy';

const C = {
  coral: '#F98F73',
  coralDeep: '#F1775C',
  cream: '#FFF9F5',
  ink: '#282321',
  muted: '#958B87',
  line: '#F0DCD3',
  white: '#FFFFFF',
  dark: '#25211F',
};

function Eye({ active = false, large = false }: { active?: boolean; large?: boolean }) {
  const width = large ? 154 : 48;
  const height = large ? 116 : width * 0.66;
  return (
    <Svg width={width} height={height} viewBox="0 0 160 105">
      <Path d="M8 53C26 27 51 14 80 14s54 13 72 39c-18 25-43 38-72 38S26 78 8 53Z" fill="none" stroke={C.white} strokeWidth={large ? 9 : 10} strokeLinecap="round" strokeLinejoin="round" />
      {active && <Path d="M80 76 57 54c-13-14 7-31 23-14 16-17 36 0 23 14Z" fill={C.white} />}
    </Svg>
  );
}

function RadarIcon() {
  return (
    <Svg width={30} height={30} viewBox="0 0 30 30" accessibilityLabel="Crossing radar">
      <Circle cx="15" cy="15" r="11" fill="none" stroke={C.coralDeep} strokeWidth="1.6" opacity="0.42" />
      <Circle cx="15" cy="15" r="6.5" fill="none" stroke={C.coralDeep} strokeWidth="1.8" opacity="0.68" />
      <Circle cx="15" cy="15" r="2.7" fill={C.coralDeep} />
    </Svg>
  );
}

function CameraIcon({ color = C.coralDeep }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" accessibilityLabel="Camera">
      <Path d="M8.4 6.5 9.8 4.7h4.4l1.4 1.8H19A2 2 0 0 1 21 8.5v8A2 2 0 0 1 19 18.5H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="12.4" r="3.4" fill="none" stroke={color} strokeWidth={1.7} />
    </Svg>
  );
}

function NavIcon({ type, active = false }: { type: 'home' | 'chat' | 'menu'; active?: boolean }) {
  const color = active ? C.coral : '#9A8E87';
  const path = type === 'home'
    ? 'M3.5 10.5 12 3l8.5 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-5v-6h-4v6H5a1.5 1.5 0 0 1-1.5-1.5Z'
    : type === 'chat'
      ? 'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5.5 4v-4.8A2.5 2.5 0 0 1 4 13.5Z'
      : 'M4 6h16M4 12h16M4 18h16';
  return <Svg width={20} height={20} viewBox="0 0 24 24"><Path d={path} fill={type === 'home' && active ? color : 'none'} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

function PlusIcon({ size = 21, color = '#A59992' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="BeSeen Plus">
      <Path d="M12 3.2 14.1 9.9 20.8 12l-6.7 2.1L12 20.8l-2.1-6.7L3.2 12l6.7-2.1Z" fill="none" stroke={color} strokeWidth={1.55} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Welcome({ next }: { next: () => void }) {
  return (
    <TouchableOpacity activeOpacity={1} onPress={next} style={styles.welcome}>
      <Image source={require('./assets/app-icon-foreground-1024.png')} style={styles.originalLogo} resizeMode="contain" />
      <Text style={styles.welcomeBrand}>BeSeen</Text>
    </TouchableOpacity>
  );
}

function Auth({ done, showPrivacy }: { done: () => void; showPrivacy: () => void }) {
  const [login, setLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [accepted, setAccepted] = useState(false);
  async function submit() {
    setError(''); setNotice('');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Your password must contain at least 8 characters.');
    if (!login && !accepted) return setError('You must accept the Terms and Privacy Policy.');
    setLoading(true);
    try {
      if (isBackendConfigured) {
        const result = login ? await signIn(email, password) : await signUp(email, password);
        if (!login) {
          if (result.session) { await recordCoreConsent(); await disconnectPurchases().catch(() => undefined); await signOut(); }
          setLogin(true);
          setPassword('');
          setNotice('Account created. Check your email, then sign in.');
          return;
        }
      }
      if (!login) {
        setLogin(true); setPassword(''); setNotice('Account created. You can now sign in.');
        return;
      }
      done();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'We could not continue.';
      if (!login && /already|ya existe|registered/i.test(message)) {
        setLogin(true);
        setPassword('');
        setNotice('An account already exists for this email. Sign in or request another confirmation email.');
      } else {
        setError(message);
      }
    } finally { setLoading(false); }
  }
  async function forgotPassword() {
    setError(''); setNotice('');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter your email address first.');
    try {
      if (isBackendConfigured) await sendPasswordReset(email);
      setNotice('We sent you a password reset link.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'We could not send the link.'); }
  }
  async function resendConfirmation() {
    setError(''); setNotice('');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter your email address first.');
    try {
      if (isBackendConfigured) await resendSignupConfirmation(email);
      setNotice('We sent you a new confirmation email.');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '';
      setError(/rate|seconds|segundos/i.test(message) ? 'Wait one minute before requesting another email.' : 'We could not resend the email. Check the address and try again.');
    }
  }
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.authKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.authHeader}>
            <Text style={styles.brand}>BeSeen</Text>
            <View>
              <Text style={styles.title}>{login ? 'Good to see you' : 'Be seen'}</Text>
              <Text style={styles.subtitle}>{login ? 'Sign in to continue.' : 'Create your account. Adults only.'}</Text>
            </View>
          </View>
          <View style={styles.form}>
          <TextInput value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor={C.muted} autoCapitalize="none" keyboardType="email-address" style={styles.input} />
          <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={C.muted} secureTextEntry style={styles.input} />
          {!login && <><TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} accessibilityLabel="I confirm that I am 18 or older and accept the Terms and Privacy Policy" style={styles.consentRow} onPress={() => setAccepted(!accepted)}><View style={[styles.checkbox, accepted && styles.checkboxOn]}><Text style={styles.checkmark}>{accepted ? '✓' : ''}</Text></View><Text style={styles.legal}>I confirm that I am 18 or older and accept the Terms and Privacy Policy.</Text></TouchableOpacity><TouchableOpacity accessibilityRole="link" onPress={showPrivacy}><Text style={styles.legalDocumentLink}>Read the Terms and Privacy Policy</Text></TouchableOpacity></>}
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          {!!notice && <Text style={styles.noticeText}>{notice}</Text>}
          <TouchableOpacity style={styles.primary} onPress={submit} disabled={loading}>{loading ? <ActivityIndicator color={C.white} /> : <Text style={styles.primaryText}>{login ? 'SIGN IN' : 'CREATE ACCOUNT'}</Text>}</TouchableOpacity>
          <TouchableOpacity onPress={() => setLogin(!login)}><Text style={styles.switchText}>{login ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}</Text></TouchableOpacity>
          {login && <TouchableOpacity onPress={forgotPassword}><Text style={styles.forgotText}>Forgot your password?</Text></TouchableOpacity>}
          {login && <TouchableOpacity onPress={resendConfirmation}><Text style={styles.forgotText}>Resend confirmation email</Text></TouchableOpacity>}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ResetPassword({ done }: { done: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  async function save() {
    if (password.length < 8) return setMessage('Your password must contain at least 8 characters.');
    if (password !== confirm) return setMessage('The passwords do not match.');
    setLoading(true); setMessage('');
    try {
      if (isBackendConfigured) {
        const { error } = await supabase!.auth.updateUser({ password });
        if (error) throw error;
        await unregisterPushNotifications().catch(() => undefined);
        await disconnectPurchases().catch(() => undefined);
        await signOut();
      }
      done();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'We could not change your password.'); }
    finally { setLoading(false); }
  }
  return <SafeAreaView style={styles.safe}><View style={styles.authWrap}><Text style={styles.brand}>BeSeen</Text><View><Text style={styles.title}>New password</Text><Text style={styles.subtitle}>Choose a secure password you do not use in other apps.</Text></View><View style={styles.form}><TextInput value={password} onChangeText={setPassword} placeholder="New password" placeholderTextColor={C.muted} secureTextEntry style={styles.input} /><TextInput value={confirm} onChangeText={setConfirm} placeholder="Repeat password" placeholderTextColor={C.muted} secureTextEntry style={styles.input} />{!!message && <Text style={styles.errorText}>{message}</Text>}<TouchableOpacity style={styles.primary} onPress={save} disabled={loading}>{loading ? <ActivityIndicator color={C.white} /> : <Text style={styles.primaryText}>SAVE PASSWORD</Text>}</TouchableOpacity></View></View></SafeAreaView>;
}

function Onboarding({ done }: { done: (username: string, city: string) => void }) {
  const [username, setUsername] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<DiscoveryCategory | null>(null);
  const [preference, setPreference] = useState<DiscoveryPreference | null>(null);
  async function submit() {
    const normalized = normalizeUsername(username);
    if (!/^[a-z0-9._]{3,24}$/.test(normalized)) return setError('Your @ must contain between 3 and 24 characters.');
    if (!isAdult(birthDate)) return setError('You must be 18 or older. Use YYYY-MM-DD.');
    if (city.trim().length < 2) return setError('Enter your city.');
    if (!category || !preference) return setError('Choose how you want to appear and who you want to see.');
    setLoading(true); setError('');
    try {
      if (isBackendConfigured) await createProfile(normalized, birthDate, city, category, preference);
      done(normalized, city.trim());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not save your profile.');
    } finally { setLoading(false); }
  }
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.authKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.onboardingPage} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.brand}>BeSeen</Text>
          <View style={styles.onboardingHeading}><Text style={styles.title}>Create your identity</Text><Text style={styles.subtitle}>Your @ is only revealed after a mutual match.</Text></View>
          <View style={styles.form}>
          <TextInput value={username} onChangeText={setUsername} placeholder="@usuario" placeholderTextColor={C.muted} autoCapitalize="none" style={styles.input} />
          <TextInput value={birthDate} onChangeText={setBirthDate} placeholder="Date of birth · YYYY-MM-DD" placeholderTextColor={C.muted} keyboardType="numbers-and-punctuation" style={styles.input} />
          <TextInput value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={C.muted} autoCapitalize="words" style={styles.input} />
          <Text style={styles.choiceLabel}>HOW DO YOU WANT TO APPEAR?</Text>
          <View style={styles.choiceRow}>{([['woman','Woman'],['man','Man'],['nonbinary','Non-binary']] as const).map(([value,label]) => <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: category === value }} key={value} onPress={() => setCategory(value)} style={[styles.choice, category === value && styles.choiceOn]}><Text style={[styles.choiceText, category === value && styles.choiceTextOn]}>{label}</Text></TouchableOpacity>)}</View>
          <Text style={styles.choiceLabel}>WHO DO YOU WANT TO SEE?</Text>
          <View style={styles.choiceRow}>{([['woman','Women'],['man','Men'],['nonbinary','Non-binary'],['everyone','Everyone']] as const).map(([value,label]) => <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: preference === value }} key={value} onPress={() => setPreference(value)} style={[styles.choice, preference === value && styles.choiceOn]}><Text style={[styles.choiceText, preference === value && styles.choiceTextOn]}>{label}</Text></TouchableOpacity>)}</View>
          <Text style={styles.legal}>These choices are private and are only used to filter compatible crossings.</Text>
          <View style={styles.verificationNote}><Text style={styles.verificationTitle}>Adults only</Text><Text style={styles.legal}>We confirm the age you provide, but we do not store your date of birth or request an identity document.</Text></View>
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <TouchableOpacity style={styles.primary} onPress={submit} disabled={loading}>{loading ? <ActivityIndicator color={C.white} /> : <Text style={styles.primaryText}>CONTINUE</Text>}</TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Home({ active, changingMode, remaining, activate, nearby, chat, settings, outfit, premium, allowance }: { active: boolean; changingMode: boolean; remaining: string; activate: () => void; nearby: () => void; chat: () => void; settings: () => void; outfit: () => void; premium: () => void; username: string; allowance: { hasPlus: boolean; remaining: number } }) {
  const insets = useSafeAreaInsets();
  const navigationHeight = 74 + insets.bottom;
  return (
    <View style={[styles.homeSafe, { paddingTop: Math.max(insets.top, 10) }]}>
      <ScrollView style={styles.homeScroll} contentContainerStyle={[styles.homePage, { paddingBottom: navigationHeight + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.homeHeader}><Text style={styles.homeBrand}>BeSeen</Text></View>
        <View style={[styles.modePanel, active && styles.modePanelActive]}>
          <View style={styles.modeTop}><View style={styles.modeTag}><View style={[styles.liveDot, active && styles.liveDotActive]} /><Text style={[styles.modeTagText, active && styles.modeTagTextActive]}>{active ? 'STREET MODE ACTIVE' : 'STREET MODE'}</Text></View><View style={[styles.rangeChip, active && styles.rangeChipActive]}><Text style={[styles.rangeText, active && styles.rangeTextActive]}>50 m</Text></View></View>
          <View><Text style={styles.modeTitle}>{active ? remaining : '30:00'}</Text><Text style={styles.modeDescription}>{active ? 'Your outfit is visible nearby.' : 'Be visible for 30 minutes.'}</Text></View>
          <TouchableOpacity onPress={activate} style={[styles.modeButton, styles.coralAction, changingMode && styles.requestedButton]} disabled={changingMode}><Text style={styles.modeButtonText}>{changingMode ? (active ? 'Deactivating...' : 'Activating...') : active ? 'Deactivate Street Mode' : 'Activate Street Mode'}</Text></TouchableOpacity>
          <Text style={styles.modePrivacy}>only while BeSeen is open{"\n"}your exact location is never shared</Text>
        </View>
        <View style={styles.sectionHeader}><Text style={styles.darkSection}>Recent crossings</Text><TouchableOpacity onPress={nearby}><Text style={styles.sectionLink}>View all</Text></TouchableOpacity></View>
        <TouchableOpacity style={styles.crossingCard} onPress={nearby}><View style={styles.crossingThumb}><RadarIcon /></View><View style={styles.crossingBody}><Text style={styles.crossingTitle}>{active ? 'New crossings nearby' : 'Your crossings will appear here'}</Text><Text style={styles.crossingCopy}>Outfits only · last 3 hours</Text></View><Text style={styles.crossingArrow}>›</Text></TouchableOpacity>
        <View style={styles.sectionHeader}><Text style={styles.darkSection}>Upcoming events</Text></View>
        <View style={styles.darkEmptyEvent}><Text style={styles.darkEventTitle}>No events yet</Text><Text style={styles.darkEventCopy}>We are preparing the first BeSeen spaces.</Text></View>
      </ScrollView>
      <View style={[styles.bottomNav, { height: navigationHeight, paddingBottom: Math.max(insets.bottom, 8) }]}><TouchableOpacity accessibilityLabel="Home" style={styles.navItem}><NavIcon type="home" active /><Text style={styles.navTextActive}>Home</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="Chat" style={styles.navItem} onPress={chat}><NavIcon type="chat" /><Text style={styles.navText}>Chat</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="Add outfit" style={styles.addOutfit} onPress={outfit}><Text style={styles.addOutfitText}>+</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="BeSeen Plus" style={styles.navItem} onPress={premium}><PlusIcon /><Text style={styles.navText}>Plus</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="Profile" style={styles.navItem} onPress={settings}><NavIcon type="menu" /><Text style={styles.navText}>Profile</Text></TouchableOpacity></View>
    </View>
  );
}

function Outfit({ saved, cancel, hasPlus, currentPhotoUri, lastOutfitAt }: { saved: (outfitId: string | undefined, moderationStatus: string | undefined, photoUri: string) => void; cancel: () => void; hasPlus: boolean; currentPhotoUri?: string; lastOutfitAt: number | null }) {
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(currentPhotoUri ? { uri: currentPhotoUri } as ImagePicker.ImagePickerAsset : null);
  const [loading, setLoading] = useState(false);
  const [savedOk, setSavedOk] = useState(Boolean(currentPhotoUri));
  async function choosePhoto() {
    if (!hasPlus && lastOutfitAt && Date.now() - lastOutfitAt < 24 * 60 * 60_000) {
      return Alert.alert("Today's outfit is already saved", 'The free plan includes one outfit every 24 hours. BeSeen Plus gives you unlimited changes.');
    }
    if (isBackendConfigured) {
      const allowance = await getOutfitChangeAllowance().catch(() => null);
      if (allowance && !allowance.can_change) return Alert.alert("Today's outfit is already saved", 'The free plan includes one outfit every 24 hours. BeSeen Plus gives you unlimited changes.');
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert('Camera permission required', 'Allow camera access to take your outfit photo.');
    const options = { mediaTypes: ['images'] as ImagePicker.MediaType[], allowsEditing: true, aspect: [9, 16] as [number, number], quality: 0.4 };
    const result = await ImagePicker.launchCameraAsync(options);
    if (!result.canceled) { setPhoto(result.assets[0]); setSavedOk(false); }
  }
  async function savePhoto() {
    if (!photo) return;
    setLoading(true);
    try {
      const outfit = isBackendConfigured ? await uploadOutfit(photo.uri, photo.mimeType, photo.fileSize) : null;
      saved(outfit?.id, outfit?.moderation_status, photo.uri);
      setSavedOk(true);
    } catch (reason) {
      const message = reason instanceof Error
        ? reason.message
        : reason && typeof reason === 'object' && 'message' in reason && typeof reason.message === 'string'
          ? reason.message
          : 'Please try again.';
      Alert.alert('We could not save your outfit', /row-level security|policy|not authorized/i.test(message) ? 'Your free outfit may already be saved for the next 24 hours. Check your connection or try again after the limit resets.' : message);
    } finally { setLoading(false); }
  }
  return (
    <SafeAreaView style={styles.homeSafe}>
      <View style={styles.darkPage}>
        <View style={styles.header}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={cancel}><Text style={styles.backText}>‹</Text></TouchableOpacity><Text style={styles.homeBrand}>Outfit</Text><View style={styles.headerSpacer} /></View>
        <View style={styles.outfitHeading}><Text style={styles.outfitEyebrow}>TODAY'S OUTFIT</Text><Text style={styles.outfitTitle}>Be seen.</Text><Text style={styles.outfitSubtitle}>One vertical photo. No face. Just your style.</Text></View>
        <TouchableOpacity onPress={choosePhoto} style={[styles.photoBox, photo && styles.photoFilled]}>
          {photo ? <Image source={{ uri: photo.uri }} style={styles.outfitImage} /> : <View style={styles.storyEmpty}><View style={styles.storyAdd}><Text style={styles.storyAddText}>+</Text></View><Text style={styles.noPhoto}>Add your outfit</Text><Text style={styles.storyHint}>Tap to open the camera</Text></View>}
        </TouchableOpacity>
        <View style={styles.outfitActions}>
          <View style={styles.storyTools}><TouchableOpacity style={[styles.cameraButton, !photo && styles.cameraButtonPrimary]} onPress={choosePhoto}><CameraIcon color={photo ? C.coralDeep : C.white} /><Text style={[styles.cameraButtonText, !photo && styles.cameraButtonTextPrimary]}>{photo ? 'Retake photo' : 'Take photo'}</Text></TouchableOpacity></View>
          {photo && !savedOk && <TouchableOpacity style={[styles.modeButton, styles.coralAction, styles.storySave]} onPress={savePhoto} disabled={loading}>{loading ? <ActivityIndicator color={C.white} /> : <Text style={styles.storySaveText}>Save outfit</Text>}</TouchableOpacity>}
          {savedOk && <Text style={styles.outfitSaved}>Outfit saved · this is your visible photo</Text>}
        </View>
        <Text style={styles.darkSafety}>Visible in Street Mode and related crossings for 24 hours.</Text>
      </View>
    </SafeAreaView>
  );
}

function Nearby({ match, back }: { match: (username: string) => void; back: () => void }) {
  const [requested, setRequested] = useState<string[]>(isBackendConfigured ? [] : ['demo-2']);
  const [loading, setLoading] = useState(isBackendConfigured);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [encounters, setEncounters] = useState<Array<{ sessionId: string; time: string; requested: boolean; imageUrl?: string }>>([
    { sessionId: 'demo-1', time: '2 min ago', requested: false },
    { sessionId: 'demo-2', time: '17 min ago', requested: true },
    { sessionId: 'demo-3', time: '2 h ago', requested: false },
  ]);
  const loadEncounters = useCallback(async (manual = false) => {
    if (!isBackendConfigured) return;
    if (manual) setRefreshing(true);
    setLoadError('');
    try {
      const rows = await findRecentEncounters();
      const next = await Promise.all((rows ?? []).map(async (row: { session_id: string; outfit_path: string; crossed_at: string; requested: boolean }) => ({
        sessionId: row.session_id,
        time: relativeTime(row.crossed_at),
        requested: row.requested,
        imageUrl: await getTemporaryOutfitUrl(row.outfit_path).catch(() => undefined),
      })));
      setEncounters(next);
    } catch {
      setLoadError('We could not update your crossings. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    if (!isBackendConfigured) return;
    loadEncounters();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') loadEncounters();
    }, 30_000);
    return () => clearInterval(timer);
  }, [loadEncounters]);
  async function sendRequest(sessionId: string, alreadyRequested: boolean) {
    if (requested.includes(sessionId) || alreadyRequested) return;
    setRequested((current) => [...current, sessionId]);
    if (!isBackendConfigured) { if (sessionId === 'demo-1') match('lucia.rm'); return; }
    try {
      const result = await requestInteraction(sessionId) as { matched?: boolean; username?: string } | null;
      if (result?.matched && result.username) match(result.username);
    } catch (reason) {
      setRequested((current) => current.filter((value) => value !== sessionId));
      Alert.alert('Request failed', reason instanceof Error ? reason.message : 'Please try again.');
    }
  }
  function safetyMenu(sessionId: string) {
    Alert.alert('Safety', 'The other person will not be notified.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report outfit', onPress: async () => {
        try { if (isBackendConfigured) await reportEncounter(sessionId, 'inappropriate_outfit'); setEncounters((current) => current.filter((item) => item.sessionId !== sessionId)); Alert.alert('Report sent', 'Thank you. We will review this content.'); }
        catch { Alert.alert('The report could not be sent'); }
      } },
      { text: 'Block', style: 'destructive', onPress: async () => {
        try {
          if (isBackendConfigured) await blockEncounter(sessionId);
          setEncounters((current) => current.filter((item) => item.sessionId !== sessionId));
        } catch { Alert.alert('The user could not be blocked'); }
      } },
    ]);
  }
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadEncounters(true)} tintColor={C.coral} colors={[C.coral]} />}>
        <View style={styles.header}><TouchableOpacity onPress={back}><Text style={styles.backText}>‹</Text></TouchableOpacity><Text style={styles.brand}>BeSeen</Text><View style={styles.headerSpacer} /></View>
        <Text style={styles.recentTitle}>You crossed paths with:</Text>
        <Text style={styles.recentSubtitle}>No name, no face: just their outfit</Text>
        {loading && <ActivityIndicator color={C.coral} />}
        <View style={styles.encounterList}>
          {encounters.map((encounter, index) => {
            const isRequested = requested.includes(encounter.sessionId) || encounter.requested;
            return (
              <View key={encounter.sessionId} style={styles.encounterRow}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Opciones de seguridad" style={styles.moreButton} onPress={() => safetyMenu(encounter.sessionId)}><Text style={styles.moreText}>•••</Text></TouchableOpacity>
                <View style={[styles.outfitThumb, { backgroundColor: ['#D9A08B', '#B3A4A0', '#D7B395'][index] }]}>
                  {encounter.imageUrl ? <Image source={{ uri: encounter.imageUrl }} style={styles.encounterImage} /> : <Eye active />}
                </View>
                <View style={styles.encounterAction}>
                  <Text style={styles.encounterTime}>{encounter.time}</Text>
                  <TouchableOpacity
                    style={[styles.requestButton, isRequested && styles.requestedButton]}
                    onPress={() => sendRequest(encounter.sessionId, encounter.requested)}
                  >
                    <Text style={styles.requestText}>{isRequested ? 'REQUESTED' : 'REQUEST\nCONNECTION'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
        {!loading && encounters.length === 0 && <View style={styles.emptyState}><Eye active /><Text style={styles.emptyTitle}>No crossings yet</Text><Text style={styles.emptyCopy}>When you cross paths with someone in Street Mode, their outfit will appear here for 3 hours.</Text></View>}
        {!!loadError && <Text style={styles.errorText}>{loadError}</Text>}
        <Text style={styles.safety}>Your @ is only revealed when the request is mutual.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function CityChat({ back, premium, hasPlus, city, outfitId, matched }: { back: () => void; premium: () => void; hasPlus: boolean; city: string; outfitId?: string; matched: (username: string) => void }) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [placeHint, setPlaceHint] = useState('');
  const [timeHint, setTimeHint] = useState('');
  const [posts, setPosts] = useState<Array<{ id: string; description: string; place: string; seenTime: string; age: string; isOwn?: boolean; moderationStatus: 'pending' | 'approved' | 'rejected' }>>(isBackendConfigured ? [] : [
    { id: 'city-1', description: 'Denim jacket, black trousers and red trainers.', place: 'Line 1 · Sol station', seenTime: 'around 7:30 pm', age: '12 min ago', moderationStatus: 'approved' },
    { id: 'city-2', description: 'Long beige coat and orange tote bag.', place: 'Near the central station', seenTime: 'around 6:45 pm', age: '41 min ago', moderationStatus: 'approved' },
  ]);
  const [responses, setResponses] = useState<Record<string, Array<{ id: string; imageUrl?: string; age: string }>>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [responding, setResponding] = useState<string[]>([]);
  const [reporting, setReporting] = useState<string[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const loadPosts = useCallback(async (showRefresh = false) => {
    if (!isBackendConfigured) return;
    if (showRefresh) setRefreshing(true);
    try {
      const rows = await listCityPosts();
      setPosts(rows.map((row) => ({ id: row.post_id, description: row.description, place: row.place_hint, seenTime: row.time_hint, age: relativeTime(row.created_at), isOwn: row.is_own, moderationStatus: row.moderation_status })));
    } catch { if (showRefresh) Alert.alert('We could not update the chat'); }
    finally { if (showRefresh) setRefreshing(false); }
  }, []);
  useEffect(() => {
    if (!isBackendConfigured) return;
    loadPosts(true);
    const timer = setInterval(() => { if (AppState.currentState === 'active') loadPosts(); }, 20_000);
    const appStateSubscription = AppState.addEventListener('change', (state) => { if (state === 'active') loadPosts(); });
    return () => { clearInterval(timer); appStateSubscription.remove(); };
  }, [loadPosts]);
  async function publish() {
    if (publishing) return;
    const description = draft.trim();
    if (description.length < 12) return Alert.alert('Add a little more detail', 'Include clothing and colours, but avoid names, number plates or exact addresses.');
    if (placeHint.trim().length < 3) return Alert.alert('Location missing', 'Enter an approximate area, station or public place. Never an exact address.');
    if (timeHint.trim().length < 3) return Alert.alert('Time missing', 'Enter approximately when it happened.');
    setPublishing(true);
    try {
      const id = isBackendConfigured ? await createCityPost(description, placeHint, timeHint) : String(Date.now());
      setPosts((current) => [{ id, description, place: placeHint.trim(), seenTime: timeHint.trim(), age: 'now', isOwn: true, moderationStatus: isBackendConfigured ? 'pending' : 'approved' }, ...current]); setDraft(''); setPlaceHint(''); setTimeHint('');
      setComposerOpen(false);
      if (isBackendConfigured) registerPushNotifications().catch(() => undefined);
    } catch (reason) { Alert.alert('Post failed', reason instanceof Error ? reason.message : 'Please try again.'); }
    finally { setPublishing(false); }
  }
  async function respond(postId: string) {
    if (responding.includes(postId)) return;
    if (!outfitId) return Alert.alert('You need an outfit', 'Upload your outfit with the + button so the other person can recognise you.');
    setResponding((current) => [...current, postId]);
    try {
      if (isBackendConfigured) await respondToCityPost(postId, outfitId);
      if (isBackendConfigured) registerPushNotifications().catch(() => undefined);
      Alert.alert('Request sent', 'Your outfit is linked to this post. Your @ is not revealed automatically.');
    } catch (reason) { Alert.alert('Request failed', reason instanceof Error ? reason.message : 'Please try again.'); }
    finally { setResponding((current) => current.filter((id) => id !== postId)); }
  }
  async function reportPost(postId: string) {
    if (reporting.includes(postId)) return;
    setReporting((current) => [...current, postId]);
    try { if (isBackendConfigured) await reportCityPost(postId); setPosts((current) => current.filter((post) => post.id !== postId)); Alert.alert('Report sent', 'Thank you. We will review the post.'); }
    catch { Alert.alert('The report could not be sent', 'Check your connection and try again.'); }
    finally { setReporting((current) => current.filter((id) => id !== postId)); }
  }
  async function openResponses(postId: string) {
    if (!isBackendConfigured) return setResponses((current) => ({ ...current, [postId]: [{ id: 'demo-response', age: '3 min ago' }] }));
    try {
      const rows = await listCityPostResponses(postId);
      const items = await Promise.all(rows.map(async (row: { response_id: string; outfit_path: string; created_at: string }) => ({ id: row.response_id, imageUrl: await getTemporaryOutfitUrl(row.outfit_path).catch(() => undefined), age: relativeTime(row.created_at) })));
      setResponses((current) => ({ ...current, [postId]: items }));
    } catch { Alert.alert('We could not load the responses'); }
  }
  async function acceptResponse(responseId: string) {
    if (!isBackendConfigured) return matched('lucia.rm');
    try { const result = await acceptCityPostResponse(responseId); matched(result.username); }
    catch (reason) { Alert.alert('Could not accept', reason instanceof Error ? reason.message : 'Please try again.'); }
  }
  return (
    <SafeAreaView style={styles.homeSafe}>
      <View style={styles.chatPage}>
        <View style={styles.header}><TouchableOpacity onPress={back}><Text style={styles.backText}>‹</Text></TouchableOpacity><View><Text style={styles.chatTitle}>{(city || 'Madrid').toUpperCase()}</Text><Text style={styles.chatCity}>ANONYMOUS POSTS</Text></View><View style={styles.headerSpacer} /></View>
        <Text style={styles.chatIntro}>Describe who you saw. No names, faces or exact locations.</Text>
        <ScrollView contentContainerStyle={styles.cityFeed} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadPosts(true)} tintColor={C.coral} colors={[C.coral]} />}>
          {posts.map((post) => <View key={post.id} style={styles.cityPost}><View style={styles.postMeta}><Text style={styles.postAnonymous}>{post.isOwn ? 'YOUR POST' : 'ANONYMOUS'}</Text><Text style={styles.postAge}>{post.isOwn && post.moderationStatus === 'pending' ? 'UNDER REVIEW' : post.isOwn && post.moderationStatus === 'rejected' ? 'NOT APPROVED' : post.age}</Text></View><Text style={styles.postDescription}>{post.description}</Text><View style={styles.postContext}><Text style={styles.postContextText}>⌖ {post.place}</Text><Text style={styles.postContextText}>◷ {post.seenTime}</Text></View>{post.isOwn ? post.moderationStatus === 'approved' ? <TouchableOpacity onPress={() => openResponses(post.id)}><Text style={styles.postAction}>View responses</Text></TouchableOpacity> : <Text style={styles.reportPost}>{post.moderationStatus === 'pending' ? 'We will publish it after review.' : 'This post is not visible to other people.'}</Text> : <View style={styles.postActions}><TouchableOpacity onPress={() => respond(post.id)} disabled={responding.includes(post.id)}><Text style={styles.postAction}>{responding.includes(post.id) ? 'SENDING...' : 'I think it was me · request'}</Text></TouchableOpacity><TouchableOpacity onPress={() => reportPost(post.id)} disabled={reporting.includes(post.id)}><Text style={styles.reportPost}>{reporting.includes(post.id) ? 'SENDING...' : 'Report'}</Text></TouchableOpacity></View>}{responses[post.id]?.map((response) => <View key={response.id} style={styles.chatResponse}>{response.imageUrl ? <Image source={{ uri: response.imageUrl }} style={styles.responseImage} /> : <View style={styles.responsePlaceholder}><Eye active /></View>}<View style={styles.responseInfo}><Text style={styles.postAge}>{response.age}</Text><TouchableOpacity style={styles.responseAccept} onPress={() => acceptResponse(response.id)}><Text style={styles.responseAcceptText}>ACCEPT</Text></TouchableOpacity></View></View>)}</View>)}
          {!hasPlus && <TouchableOpacity style={styles.archiveLock} onPress={premium}><Text style={styles.archiveLockTitle}>Unlock the full city chat</Text><Text style={styles.archiveLockCopy}>The interface is available for the demo. Posting and 24-hour history are included with BeSeen Plus.</Text></TouchableOpacity>}
        </ScrollView>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Create post" style={styles.chatFab} onPress={() => hasPlus ? setComposerOpen(true) : premium()}><Text style={styles.chatFabPlus}>+</Text></TouchableOpacity>
        <Modal visible={composerOpen} transparent animationType="fade" onRequestClose={() => setComposerOpen(false)}>
          <KeyboardAvoidingView style={styles.composerModal} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <TouchableOpacity style={styles.composerBackdrop} activeOpacity={1} onPress={() => setComposerOpen(false)} />
            <View style={[styles.composerSheet, { paddingTop: Math.max(insets.top + 24, 52) }]}><View style={styles.composerHeader}><View><Text style={styles.composerTitle}>New post</Text><Text style={styles.composerSubtitle}>Share where and when you crossed paths.</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close post" onPress={() => setComposerOpen(false)} style={styles.composerClose}><Text style={styles.composerCloseText}>×</Text></TouchableOpacity></View><View style={styles.composer}><TextInput value={draft} onChangeText={setDraft} multiline maxLength={280} autoFocus placeholder="Describe the outfit: clothes, colours..." placeholderTextColor="#A89B94" style={styles.composerInput} /><View style={styles.chatFields}><TextInput value={placeHint} onChangeText={setPlaceHint} maxLength={100} placeholder="Where · approximate area" placeholderTextColor="#A89B94" style={styles.chatField} /><TextInput value={timeHint} onChangeText={setTimeHint} maxLength={40} placeholder="Time · around 7:30 pm" placeholderTextColor="#A89B94" style={styles.chatField} /></View><View style={styles.composerBottom}><Text style={styles.characterCount}>{draft.length}/280</Text><TouchableOpacity style={[styles.publishButton, publishing && styles.requestedButton]} onPress={publish} disabled={publishing}><Text style={styles.publishText}>{publishing ? 'POSTING...' : 'POST'}</Text></TouchableOpacity></View></View></View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

function Settings({ username, city, saveUsername, saveCity, back, logout, premium, matches, privacy }: { username: string; city: string; saveUsername: (value: string) => void; saveCity: (value: string) => void; back: () => void; logout: () => void; premium: () => void; matches: () => void; privacy: () => void }) {
  const [draft, setDraft] = useState(username);
  const [cityDraft, setCityDraft] = useState(city);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [identityStatus, setIdentityStatus] = useState<IdentityStatus>('pending');
  const [category, setCategory] = useState<DiscoveryCategory>('woman');
  const [preference, setPreference] = useState<DiscoveryPreference>('everyone');
  const [discoveryMessage, setDiscoveryMessage] = useState('');
  useEffect(() => {
    if (isBackendConfigured) {
      getIdentityStatus().then(setIdentityStatus).catch(() => undefined);
      getCurrentProfile().then((profile) => {
        if (profile?.discovery_category) setCategory(profile.discovery_category as DiscoveryCategory);
        if (profile?.discovery_preference) setPreference(profile.discovery_preference as DiscoveryPreference);
      }).catch(() => undefined);
    }
  }, []);
  async function verifyIdentity() {
    if (!isBackendConfigured) { setIdentityStatus('verified'); return; }
    try {
      await startIdentityVerification();
      setIdentityStatus('verified');
      Alert.alert('Age confirmed', 'You can now use Street Mode.');
    } catch (reason) {
      Alert.alert('Verification failed', reason instanceof Error ? reason.message : 'Please try again.');
    }
  }
  async function save() {
    const normalized = normalizeUsername(draft);
    if (!/^[a-z0-9._]{3,24}$/.test(normalized)) return setMessage('This @ is not valid.');
    setLoading(true); setMessage('');
    try {
      if (isBackendConfigured) await updateUsername(normalized);
      saveUsername(normalized);
      setMessage('Username updated.');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Could not update your username.');
    } finally { setLoading(false); }
  }
  async function saveDiscovery() {
    setDiscoveryMessage('');
    try {
      if (isBackendConfigured) await updateDiscoveryPreferences(category, preference);
      setDiscoveryMessage('Preferences saved.');
    } catch (reason) {
      setDiscoveryMessage(reason instanceof Error ? reason.message : 'Could not save your preferences.');
    }
  }
  async function saveProfileCity() {
    try {
      const normalized = isBackendConfigured ? await updateCity(cityDraft) : cityDraft.trim();
      if (normalized.length < 2) throw new Error('Enter a valid city.');
      saveCity(normalized); setCityDraft(normalized); setDiscoveryMessage('City saved.');
    } catch (reason) { setDiscoveryMessage(reason instanceof Error ? reason.message : 'Could not save the city.'); }
  }
  function confirmDelete() {
    Alert.alert('Delete account', 'Your profile, outfits, requests and matches will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { if (isBackendConfigured) await requestAccountDeletion(); logout(); }
        catch (reason) { Alert.alert('Could not delete the account', reason instanceof Error ? reason.message : 'Please try again.'); }
      } },
    ]);
  }
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.settingsPage}>
        <View style={styles.header}><TouchableOpacity onPress={back}><Text style={styles.backText}>‹</Text></TouchableOpacity><Text style={styles.brand}>BeSeen</Text><View style={styles.headerSpacer} /></View>
        <Text style={styles.title}>Settings</Text>
        <View style={[styles.settingSection, styles.compactSettingSection]}>
          <Text style={styles.settingLabel}>YOUR USERNAME</Text>
          <TextInput value={draft} onChangeText={setDraft} autoCapitalize="none" style={[styles.input, styles.profileInput]} />
          <Text style={styles.legal}>You can change it once every 30 days.</Text>
          {!!message && <Text style={message === 'Username updated.' ? styles.successText : styles.errorText}>{message}</Text>}
          <TouchableOpacity style={[styles.primary, styles.profileAction]} onPress={save} disabled={loading}>{loading ? <ActivityIndicator color={C.white} /> : <Text style={styles.primaryText}>SAVE CHANGE</Text>}</TouchableOpacity>
        </View>
        <View style={[styles.settingSection, styles.compactSettingSection]}>
          <Text style={styles.settingLabel}>YOUR PREFERENCES</Text>
          <Text style={[styles.choiceLabel, styles.cityChoiceLabel]}>YOUR CITY</Text>
          <TextInput value={cityDraft} onChangeText={setCityDraft} autoCapitalize="words" style={[styles.input, styles.profileInput]} placeholder="City" placeholderTextColor={C.muted} />
          <TouchableOpacity style={[styles.outlineButton, styles.profileAction]} onPress={saveProfileCity}><Text style={styles.outlineText}>SAVE CITY</Text></TouchableOpacity>
          <View style={styles.preferenceGroup}>
            <Text style={styles.choiceLabel}>HOW YOU WANT TO APPEAR</Text>
            <View style={styles.profileChoiceRow}>{([['woman','Woman'],['man','Man'],['nonbinary','Non-binary']] as const).map(([value,label]) => <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: category === value }} key={value} onPress={() => setCategory(value)} style={[styles.profileChoice, category === value && styles.profileChoiceOn]}><Text style={[styles.profileChoiceText, category === value && styles.profileChoiceTextOn]}>{label}</Text><View style={[styles.choiceIndicator, category === value && styles.choiceIndicatorOn]}>{category === value && <Text style={styles.choiceCheck}>✓</Text>}</View></TouchableOpacity>)}</View>
          </View>
          <View style={[styles.preferenceGroup, styles.nextPreferenceGroup]}>
            <Text style={styles.choiceLabel}>WHO YOU WANT TO SEE</Text>
            <View style={styles.profileChoiceRow}>{([['woman','Women'],['man','Men'],['nonbinary','Non-binary'],['everyone','Everyone']] as const).map(([value,label]) => <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: preference === value }} key={value} onPress={() => setPreference(value)} style={[styles.profileChoice, preference === value && styles.profileChoiceOn]}><Text style={[styles.profileChoiceText, preference === value && styles.profileChoiceTextOn]}>{label}</Text><View style={[styles.choiceIndicator, preference === value && styles.choiceIndicatorOn]}>{preference === value && <Text style={styles.choiceCheck}>✓</Text>}</View></TouchableOpacity>)}</View>
          </View>
          <Text style={styles.legal}>This is private. It is only used to show mutually compatible crossings.</Text>
          {!!discoveryMessage && <Text style={discoveryMessage === 'Preferences saved.' || discoveryMessage === 'City saved.' ? styles.successText : styles.errorText}>{discoveryMessage}</Text>}
          <TouchableOpacity style={[styles.primary, styles.profileAction]} onPress={saveDiscovery}><Text style={styles.primaryText}>SAVE PREFERENCES</Text></TouchableOpacity>
        </View>
        <View style={styles.settingSection}>
          <Text style={styles.settingLabel}>AGE AND SAFETY</Text>
          <View style={styles.statusRow}><View style={[styles.statusDot, identityStatus === 'verified' && styles.statusVerified, identityStatus === 'rejected' && styles.statusRejected]} /><View><Text style={styles.statusTitle}>Adult status {identityStatus === 'verified' ? 'confirmed' : 'pending'}</Text><Text style={styles.cardCopy}>{identityStatus === 'verified' ? 'You can use Street Mode' : 'Required to activate Street Mode'}</Text></View></View>
          {identityStatus !== 'verified' && <TouchableOpacity style={[styles.outlineButton, styles.profileAction]} onPress={verifyIdentity}><Text style={styles.outlineText}>CONFIRM ADULT STATUS</Text></TouchableOpacity>}
        </View>
        <TouchableOpacity style={styles.plusCard} onPress={premium}><View><Text style={styles.plusTitle}>BeSeen Plus</Text><Text style={styles.plusCopy}>More control, never more power over others.</Text></View><Text style={styles.plusArrow}>›</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.outlineButton, styles.profileAction]} onPress={matches}><Text style={styles.outlineText}>MY MATCHES</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.outlineButton, styles.profileAction]} onPress={privacy}><Text style={styles.outlineText}>PRIVACY AND DATA</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.outlineButton, styles.profileAction]} onPress={() => Alert.alert('Reports and safety', 'You can report or block someone from each crossing. We review reports without revealing your identity to the other person.')}><Text style={styles.outlineText}>HELP, REPORTS AND SAFETY</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.outlineButton, styles.profileAction]} onPress={logout}><Text style={styles.outlineText}>SIGN OUT</Text></TouchableOpacity>
        <TouchableOpacity onPress={confirmDelete}><Text style={styles.deleteText}>Delete my account</Text></TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Privacy({ back }: { back: () => void }) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.settingsPage}>
        <View style={styles.header}><TouchableOpacity onPress={back}><Text style={styles.backText}>‹</Text></TouchableOpacity><Text style={styles.brand}>BeSeen</Text><View style={styles.headerSpacer} /></View>
        <Text style={styles.title}>Terms and Privacy</Text>
        <Text style={styles.subtitle}>How BeSeen works and how your data is handled.</Text>
        <View style={styles.privacyBlock}><Text style={styles.privacyNumber}>01</Text><View style={styles.privacyBody}><Text style={styles.statusTitle}>Location under your control</Text><Text style={styles.cardCopy}>Location is only used while BeSeen is open and Street Mode is active. When you lock your phone, leave the app or stop the mode, we stop using it and erase it. Nobody sees coordinates, an address or an exact distance.</Text></View></View>
        <View style={styles.privacyBlock}><Text style={styles.privacyNumber}>02</Text><View style={styles.privacyBody}><Text style={styles.statusTitle}>Temporary data</Text><Text style={styles.cardCopy}>A recorded crossing can be viewed for 3 hours, but it does not continue tracking your position. Your outfit and image are automatically removed after 24 hours.</Text></View></View>
        <View style={styles.privacyBlock}><Text style={styles.privacyNumber}>03</Text><View style={styles.privacyBody}><Text style={styles.statusTitle}>Minimum data</Text><Text style={styles.cardCopy}>We confirm that the date provided belongs to an adult. BeSeen does not store your date of birth or request a copy of your identity document.</Text></View></View>
        <View style={styles.privacyBlock}><Text style={styles.privacyNumber}>04</Text><View style={styles.privacyBody}><Text style={styles.statusTitle}>Only when it is mutual</Text><Text style={styles.cardCopy}>Your @ is not revealed until both people request the connection.</Text></View></View>
        <Text style={styles.privacyFooter}>You can block, report or permanently delete your account from Settings.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Matches({ back, open }: { back: () => void; open: (username: string) => void }) {
  const [items, setItems] = useState<MatchSummary[]>(isBackendConfigured ? [] : [
    { match_id: 'demo-match', username: 'lucia.rm', matched_at: new Date(Date.now() - 8 * 60_000).toISOString() },
  ]);
  const [loading, setLoading] = useState(isBackendConfigured);
  useEffect(() => {
    if (!isBackendConfigured) return;
    listMyMatches().then(setItems).catch(() => undefined).finally(() => setLoading(false));
  }, []);
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <View style={styles.header}><TouchableOpacity onPress={back}><Text style={styles.backText}>‹</Text></TouchableOpacity><Text style={styles.brand}>BeSeen</Text><View style={styles.headerSpacer} /></View>
        <Text style={styles.recentTitle}>Matches</Text>
        <Text style={styles.recentSubtitle}>This is where you can see each other's @</Text>
        {loading && <ActivityIndicator color={C.coral} />}
        {!loading && items.length === 0 && <View style={styles.emptyEvent}><Text style={styles.eventTitle}>No matches yet</Text><Text style={styles.eventCopy}>A match will appear here when a request is mutual.</Text></View>}
        {items.map((item) => <TouchableOpacity key={item.match_id} style={styles.matchRow} onPress={() => open(item.username)}><View style={styles.matchAvatar}><Eye active /></View><View><Text style={styles.matchUsername}>@{item.username}</Text><Text style={styles.encounterTime}>{relativeTime(item.matched_at)}</Text></View><Text style={styles.plusArrowDark}>›</Text></TouchableOpacity>)}
      </View>
    </SafeAreaView>
  );
}

function Premium({ back, activated }: { back: () => void; activated: () => void }) {
  const [product, setProduct] = useState<PurchasesPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    configurePurchases();
    if (isRevenueCatConfigured()) getPlusPackage().then(setProduct).catch(() => setMessage('The offer is not available yet.'));
  }, []);
  async function purchase() {
    if (!product) return setMessage(isRevenueCatConfigured() ? 'Configure a monthly offering in RevenueCat.' : 'Demo mode: RevenueCat keys are missing.');
    setLoading(true); setMessage('');
    try { const active = await buyPlus(product); if (active) activated(); setMessage(active ? 'BeSeen Plus is active!' : 'The purchase did not unlock access.'); }
    catch (reason) { if (!isPurchaseCancelled(reason)) setMessage(reason instanceof Error ? reason.message : 'The purchase could not be completed.'); }
    finally { setLoading(false); }
  }
  async function restore() {
    if (!isRevenueCatConfigured()) return setMessage('Demo mode: there are no purchases to restore yet.');
    setLoading(true);
    try { const active = await restorePlus(); if (active) activated(); setMessage(active ? 'Purchase restored.' : 'No active purchase was found.'); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'The purchase could not be restored.'); }
    finally { setLoading(false); }
  }
  return (
    <SafeAreaView style={styles.premiumPage}>
      <TouchableOpacity style={styles.premiumBack} onPress={back}><Text style={styles.premiumBackText}>‹</Text></TouchableOpacity>
      <View style={styles.offerCard}>
        <Text style={styles.plusKicker}>BESEEN PLUS</Text>
        <Text style={styles.premiumTitle}>Only €1 a month</Text>
        <Text style={styles.premiumSubtitle}>Never let a crossing slip away.</Text>
        <View style={styles.benefits}>
          <Text style={styles.benefit}>✓ Unlimited outfit changes</Text>
          <Text style={styles.benefit}>✓ Access to your city chat</Text>
          <Text style={styles.benefit}>✓ Help keep BeSeen ad-free</Text>
        </View>
        <TouchableOpacity style={[styles.modeButton, styles.coralAction, !product && styles.requestedButton]} onPress={purchase} disabled={loading || !product}>{loading ? <ActivityIndicator color={C.white} /> : <Text style={styles.modeButtonText}>{product ? `ACTIVATE PLUS · ${product.product.priceString}` : 'OFFER UNAVAILABLE'}</Text>}</TouchableOpacity>
      </View>
      <TouchableOpacity onPress={restore}><Text style={styles.restoreText}>Restore purchases</Text></TouchableOpacity>
      {!!message && <Text style={styles.premiumMessage}>{message}</Text>}
      <Text style={styles.premiumLegal}>Street Mode, crossings and safety will always remain free.</Text>
    </SafeAreaView>
  );
}

function Match({ home, username }: { home: () => void; username: string }) {
  return (
    <SafeAreaView style={styles.matchPage}>
      <Image source={require('./assets/match-logo.png')} style={styles.matchLogo} resizeMode="contain" />
      <Text style={styles.matchTitle}>You crossed paths.{'\n'}You connected.</Text>
      <View style={styles.handleReveal}><Text style={styles.revealLabel}>THEIR USERNAME</Text><Text style={styles.revealHandle}>@{username}</Text></View>
      <TouchableOpacity style={styles.matchBack} onPress={home}><Text style={styles.matchBackText}>Back to home</Text></TouchableOpacity>
    </SafeAreaView>
  );
}

function ConfigurationProblem() {
  return <SafeAreaView style={styles.failurePage}><Eye active large /><Text style={styles.failureTitle}>BeSeen is not configured yet</Text><Text style={styles.failureCopy}>{configurationError}</Text><Text style={styles.failureHint}>This protection prevents releasing a version that looks functional but cannot save accounts securely.</Text></SafeAreaView>;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <SafeAreaView style={styles.failurePage}><Text style={styles.failureTitle}>Something went wrong</Text><Text style={styles.failureCopy}>Your data was not sent. Close and reopen BeSeen.</Text></SafeAreaView>;
    return this.props.children;
  }
}

function BeSeenApp() {
  const [screen, setScreen] = useState<Screen>('auth');
  const [showIntro, setShowIntro] = useState(true);
  const [booting, setBooting] = useState(isBackendConfigured);
  const [activeUntil, setActiveUntil] = useState<number | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [username, setUsername] = useState('marcositos');
  const [city, setCity] = useState('Madrid');
  const [preparedOutfit, setPreparedOutfit] = useState<{ id: string; moderationStatus: string; photoUri?: string } | null>(null);
  const [lastOutfitAt, setLastOutfitAt] = useState<number | null>(null);
  const [allowance, setAllowance] = useState({ hasPlus: false, remaining: 3 });
  const [streetModeLoading, setStreetModeLoading] = useState(false);
  const streetModeLock = useRef(false);
  const [matchedUsername, setMatchedUsername] = useState('');
  const [privacyBackScreen, setPrivacyBackScreen] = useState<'auth' | 'settings'>('auth');
  useEffect(() => {
    const timer = setTimeout(() => setShowIntro(false), 2_000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      configurePurchases(data.session.user.id);
      const profile = await getCurrentProfile();
      if (profile) {
        setUsername(profile.username);
        setCity(profile.city);
        const activeSession = await getActiveStreetSession();
        const latestOutfit = await getLatestOutfit().catch(() => null);
        if (latestOutfit) setLastOutfitAt(new Date(latestOutfit.created_at).getTime());
        if (activeSession) { setPreparedOutfit({ id: activeSession.outfit_id, moderationStatus: 'approved', photoUri: latestOutfit?.id === activeSession.outfit_id ? latestOutfit.imageUrl : undefined }); setClock(Date.now()); setActiveUntil(new Date(activeSession.expires_at).getTime()); }
        else if (latestOutfit && new Date(latestOutfit.expires_at).getTime() > Date.now()) setPreparedOutfit({ id: latestOutfit.id, moderationStatus: 'approved', photoUri: latestOutfit.imageUrl });
        const streetAllowance = await getStreetModeAllowance().catch(() => null);
        if (streetAllowance) setAllowance({ hasPlus: streetAllowance.has_plus, remaining: streetAllowance.remaining });
        const initialDestination = await getInitialNotificationDestination();
        const initialMatch = initialDestination?.type === 'match' && initialDestination.matchId ? await getMatch(initialDestination.matchId) : null;
        if (initialMatch) { setMatchedUsername(initialMatch.username); setScreen('match'); }
        else if (initialDestination?.type === 'city_response') setScreen('cityChat');
        else setScreen('home');
      }
      else setScreen('onboarding');
    }).catch(() => undefined).finally(() => setBooting(false));
  }, []);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setScreen('resetPassword');
      if (event === 'SIGNED_OUT') {
        disconnectPurchases().catch(() => undefined);
        setActiveUntil(null);
        setPreparedOutfit(null);
        setAllowance({ hasPlus: false, remaining: 3 });
        setMatchedUsername('');
        setScreen('auth');
      }
      if (session) configurePurchases(session.user.id);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!isBackendConfigured) return;
    const openAuthLink = async (url: string | null) => {
      if (!url || !(await handleAuthCallback(url))) return;
      if (isRecoveryCallbackUrl(url)) { setScreen('resetPassword'); return; }
      const profile = await getCurrentProfile();
      if (profile) { setUsername(profile.username); setCity(profile.city); setScreen('home'); }
      else setScreen('onboarding');
    };
    Linking.getInitialURL().then(openAuthLink).catch(() => Alert.alert('We could not confirm your email', 'Return to BeSeen and request a new confirmation link.'));
    const subscription = Linking.addEventListener('url', ({ url }) => {
      openAuthLink(url).catch(() => Alert.alert('Invalid link', 'Request a new link and try again.'));
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    const subscription = onNotificationOpened(async (destination) => {
      if (destination.type === 'city_response') { setScreen('cityChat'); return; }
      if (!isBackendConfigured || !destination.matchId) return;
      const found = await getMatch(destination.matchId).catch(() => null);
      if (found) { setMatchedUsername(found.username); setScreen('match'); }
    });
    return () => subscription.remove();
  }, []);
  const active = Boolean(activeUntil && activeUntil > clock);
  useEffect(() => {
    if (!activeUntil) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activeUntil]);
  useEffect(() => {
    if (!activeUntil || activeUntil > clock) return;
    setActiveUntil(null);
    if (isBackendConfigured) deactivateStreetMode().catch(() => undefined);
  }, [activeUntil, clock]);
  useEffect(() => {
    if (!active || !isBackendConfigured) return;
    let cancelled = false;
    let syncing = false;
    let ending = false;
    const syncStreetPresence = async () => {
      if (cancelled || syncing || AppState.currentState !== 'active') return;
      syncing = true;
      try {
        await refreshStreetLocation();
        if (!cancelled) await findRecentEncounters();
      } catch {
        // A temporary GPS or network failure should not interrupt the session.
      } finally {
        syncing = false;
      }
    };
    syncStreetPresence();
    const timer = setInterval(syncStreetPresence, 60_000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { syncStreetPresence(); return; }
      if (ending) return;
      ending = true;
      setActiveUntil(null);
      deactivateStreetMode().catch(() => undefined);
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      appStateSubscription.remove();
    };
  }, [active]);
  async function stopMode() {
    if (streetModeLock.current) return;
    streetModeLock.current = true;
    setStreetModeLoading(true);
    try { if (isBackendConfigured) await deactivateStreetMode(); }
    catch (reason) { Alert.alert('Could not deactivate Street Mode', reason instanceof Error ? reason.message : 'Please try again.'); return; }
    finally { streetModeLock.current = false; setStreetModeLoading(false); }
    setActiveUntil(null);
  }
  function prepareOutfit(outfitId: string | undefined, moderationStatus: string | undefined, photoUri: string) {
    setPreparedOutfit({ id: outfitId ?? 'demo-outfit', moderationStatus: moderationStatus ?? 'approved', photoUri });
    setLastOutfitAt(Date.now());
  }
  async function startMode() {
    if (streetModeLock.current) return;
    streetModeLock.current = true;
    setStreetModeLoading(true);
    try {
      let outfit = preparedOutfit;
      if (isBackendConfigured && (!outfit || outfit.id === 'demo-outfit')) {
        const latest = await getLatestOutfit();
        if (latest && new Date(latest.expires_at).getTime() > Date.now()) {
          outfit = { id: latest.id, moderationStatus: latest.moderation_status, photoUri: latest.imageUrl };
          setPreparedOutfit(outfit);
          setLastOutfitAt(new Date(latest.created_at).getTime());
        }
      }
      if (!outfit) {
        Alert.alert('You need an outfit', 'Tap the + button, upload an outfit photo and then activate Street Mode.');
        return;
      }
      if (isBackendConfigured) {
        await activateStreetMode(outfit.id, 30);
        registerPushNotifications().catch(() => undefined);
      }
      setClock(Date.now()); setActiveUntil(Date.now() + 30 * 60_000); setScreen('home');
      if (isBackendConfigured) {
        getStreetModeAllowance().then((streetAllowance) => setAllowance({ hasPlus: streetAllowance.has_plus, remaining: streetAllowance.remaining })).catch(() => undefined);
      } else if (!allowance.hasPlus) setAllowance((current) => ({ ...current, remaining: Math.max(0, current.remaining - 1) }));
    } catch (reason) {
      const message = reason instanceof Error
        ? reason.message
        : reason && typeof reason === 'object' && 'message' in reason && typeof reason.message === 'string'
          ? reason.message
          : 'Check your adult confirmation and outfit.';
      Alert.alert('Street Mode cannot be activated yet', message);
    } finally { streetModeLock.current = false; setStreetModeLoading(false); }
  }
  async function logout() {
    if (isBackendConfigured) {
      // Erase presence while the authenticated session can still call the RPC.
      await deactivateStreetMode().catch(() => undefined);
      await unregisterPushNotifications().catch(() => undefined);
      await disconnectPurchases().catch(() => undefined);
      try { await signOut(); }
      catch { Alert.alert('Could not sign out', 'Check your connection and try again.'); return; }
    }
    setActiveUntil(null);
    setPreparedOutfit(null);
    setAllowance({ hasPlus: false, remaining: 3 });
    setMatchedUsername('');
    setScreen('auth');
  }
  async function finishAuth() {
    if (!isBackendConfigured) { setScreen('onboarding'); return; }
    const profile = await getCurrentProfile().catch(() => null);
    if (profile) { setUsername(profile.username); setCity(profile.city); setScreen('home'); }
    else setScreen('onboarding');
  }
  const content = showIntro ? <Welcome next={() => setShowIntro(false)} />
    : configurationError ? <ConfigurationProblem />
    : booting ? <View style={styles.bootScreen}><ActivityIndicator color={C.white} size="large" /><Text style={styles.bootBrand}>BeSeen</Text></View>
    : screen === 'auth' ? <Auth done={finishAuth} showPrivacy={() => { setPrivacyBackScreen('auth'); setScreen('privacy'); }} />
    : screen === 'resetPassword' ? <ResetPassword done={() => setScreen('auth')} />
    : screen === 'onboarding' ? <Onboarding done={(value, profileCity) => { setUsername(value); setCity(profileCity); setScreen('home'); }} />
    : screen === 'home' ? <Home username={username} active={active} changingMode={streetModeLoading} remaining={remainingTime(activeUntil)} allowance={allowance} activate={() => active ? stopMode() : startMode()} outfit={() => setScreen('outfit')} nearby={() => setScreen('nearby')} chat={() => setScreen('cityChat')} settings={() => setScreen('settings')} premium={() => setScreen('premium')} />
    : screen === 'outfit' ? <Outfit saved={prepareOutfit} cancel={() => setScreen('home')} hasPlus={allowance.hasPlus} currentPhotoUri={preparedOutfit?.photoUri} lastOutfitAt={lastOutfitAt} />
    : screen === 'nearby' ? <Nearby back={() => setScreen('home')} match={(value) => { setMatchedUsername(value); setScreen('match'); }} />
    : screen === 'cityChat' ? <CityChat back={() => setScreen('home')} premium={() => setScreen('premium')} hasPlus={allowance.hasPlus} city={city} outfitId={preparedOutfit?.id} matched={(value) => { setMatchedUsername(value); setScreen('match'); }} />
    : screen === 'settings' ? <Settings username={username} city={city} saveUsername={setUsername} saveCity={setCity} back={() => setScreen('home')} logout={logout} premium={() => setScreen('premium')} matches={() => setScreen('matches')} privacy={() => { setPrivacyBackScreen('settings'); setScreen('privacy'); }} />
    : screen === 'privacy' ? <Privacy back={() => setScreen(privacyBackScreen)} />
    : screen === 'matches' ? <Matches back={() => setScreen('settings')} open={(value) => { setMatchedUsername(value); setScreen('match'); }} />
    : screen === 'premium' ? <Premium back={() => setScreen('home')} activated={() => setAllowance((current) => ({ ...current, hasPlus: true }))} />
    : <Match username={matchedUsername} home={() => setScreen('home')} />;
  return <><StatusBar barStyle={showIntro || screen === 'match' ? 'light-content' : 'dark-content'} />{content}</>;
}

export default function App() {
  return <SafeAreaProvider><ErrorBoundary><BeSeenApp /></ErrorBoundary></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.cream },
  homeSafe: { flex: 1, backgroundColor: '#F6F3EF' },
  homeScroll: { flex: 1 },
  homePage: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 21, gap: 18 },
  homeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  homeEyebrow: { color: '#968A84', fontSize: 9, fontWeight: '700', letterSpacing: 1.8, marginBottom: 3 },
  homeBrand: { color: '#F47B5F', fontSize: 28, fontWeight: '800', letterSpacing: -1.5 },
  darkSettingsIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#F7F4F0', alignItems: 'center', justifyContent: 'center' },
  modePanel: { minHeight: 272, padding: 18, borderRadius: 26, backgroundColor: '#FFF8F4', borderWidth: 1, borderColor: '#F1DDD4', justifyContent: 'space-between', shadowColor: '#8F6B5D', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  modePanelActive: { backgroundColor: '#FFF1E9', borderColor: '#FF8B6A' },
  modeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modeTag: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#B6AAA4' },
  liveDotActive: { backgroundColor: C.coral },
  modeTagText: { color: '#8E7E76', fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
  modeTagTextActive: { color: C.coralDeep },
  rangeChip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, backgroundColor: '#F4E7E0' },
  rangeChipActive: { backgroundColor: C.coral },
  rangeText: { color: '#7D6D65', fontSize: 10, fontWeight: '700' },
  rangeTextActive: { color: C.white },
  modeTitle: { color: '#24201E', fontSize: 43, lineHeight: 47, fontWeight: '700', letterSpacing: -1.8 },
  modeDescription: { color: '#887A73', fontSize: 13, lineHeight: 19, marginTop: 4 },
  modeButton: { height: 52, borderRadius: 16, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center', shadowColor: C.coral, shadowOpacity: 0.42, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  coralAction: { backgroundColor: C.coral, shadowColor: C.coral },
  modeButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modePrivacy: { color: '#A0928A', fontSize: 9, textAlign: 'center' },
  outfitSaved: { color: '#6F625B', fontSize: 10, fontWeight: '600', textAlign: 'center', marginTop: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 },
  darkSection: { color: '#4C4541', fontSize: 11, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase' },
  sectionLink: { color: C.coralDeep, fontSize: 11, fontWeight: '600' },
  crossingCard: { minHeight: 76, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E9E1DC', padding: 11, flexDirection: 'row', alignItems: 'center' },
  crossingThumb: { width: 50, height: 50, borderRadius: 15, backgroundColor: '#F9D9CC', alignItems: 'center', justifyContent: 'center' },
  crossingBody: { flex: 1, marginLeft: 8 },
  crossingTitle: { color: '#302A27', fontSize: 13, fontWeight: '600', marginBottom: 5 },
  crossingCopy: { color: '#92857E', fontSize: 11 },
  crossingArrow: { color: '#A89B94', fontSize: 24 },
  darkEmptyEvent: { minHeight: 82, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9E1DC', padding: 16, justifyContent: 'center' },
  darkEventTitle: { color: '#302A27', fontSize: 13, fontWeight: '600' },
  darkEventCopy: { color: '#92857E', fontSize: 11, lineHeight: 16, marginTop: 5 },
  bottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E9E1DC', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  navItem: { width: 58, alignItems: 'center', justifyContent: 'center', gap: 4 },
  navText: { color: '#9A8E87', fontSize: 9, fontWeight: '600' },
  navTextActive: { color: C.coral, fontSize: 9, fontWeight: '700' },
  addOutfit: { width: 56, height: 56, marginTop: -30, borderRadius: 28, backgroundColor: C.coral, borderWidth: 5, borderColor: '#F6F3EF', alignItems: 'center', justifyContent: 'center', shadowColor: C.coral, shadowOpacity: 0.35, shadowRadius: 12, elevation: 7 },
  addOutfitText: { color: '#FFFFFF', width: 46, height: 46, fontSize: 29, lineHeight: 43, fontWeight: '400', textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false },
  chatPage: { flex: 1, paddingHorizontal: 22, paddingTop: 18 },
  chatTitle: { color: '#24201E', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  chatCity: { color: '#968A84', fontSize: 8, fontWeight: '700', letterSpacing: 1.2, textAlign: 'center', marginTop: 3 },
  chatIntro: { color: '#887A73', fontSize: 11, lineHeight: 17, marginBottom: 19 },
  composer: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9E1DC', borderRadius: 23, padding: 18, marginBottom: 22 },
  composerInput: { minHeight: 78, color: '#302A27', fontSize: 12, lineHeight: 19, textAlignVertical: 'top' },
  chatFields: { gap: 12, marginVertical: 9, marginBottom: 17 },
  chatField: { height: 45, borderRadius: 14, backgroundColor: '#F8F4F1', paddingHorizontal: 14, color: '#403936', fontSize: 11 },
  composerBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  characterCount: { color: '#A89B94', fontSize: 9 },
  publishButton: { backgroundColor: C.coral, borderRadius: 16, minWidth: 92, alignItems: 'center', paddingHorizontal: 17, paddingVertical: 11 },
  publishText: { color: '#FFFFFF', fontSize: 8, fontWeight: '600', letterSpacing: 0.65 },
  cityFeed: { gap: 17, paddingBottom: 112 },
  cityPost: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9E1DC', borderRadius: 21, padding: 18 },
  postMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 },
  postAnonymous: { color: C.coralDeep, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  postAge: { color: '#A89B94', fontSize: 10 },
  postDescription: { color: '#403936', fontSize: 12, lineHeight: 18 },
  postContext: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9 },
  postContextText: { color: '#8D7F78', fontSize: 10, backgroundColor: '#F8F4F1', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  postActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 16, paddingTop: 3 },
  postAction: { color: C.coralDeep, fontSize: 10, fontWeight: '600', marginTop: 12, lineHeight: 16 },
  reportPost: { color: '#A89B94', fontSize: 9, marginTop: 12, lineHeight: 16 },
  chatResponse: { flexDirection: 'row', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#EFE7E2' },
  responseImage: { width: 52, height: 70, borderRadius: 12 },
  responsePlaceholder: { width: 52, height: 70, borderRadius: 12, backgroundColor: '#F9D9CC', alignItems: 'center', justifyContent: 'center' },
  responseInfo: { flex: 1, marginLeft: 12, justifyContent: 'space-between' },
  responseAccept: { alignSelf: 'flex-start', backgroundColor: C.coral, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 13 },
  responseAcceptText: { color: C.white, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  archiveLock: { backgroundColor: '#FFF1E9', borderWidth: 1, borderColor: '#F4C8B8', borderRadius: 18, padding: 15 },
  archiveLockTitle: { color: '#C94F34', fontSize: 13, fontWeight: '700' },
  archiveLockCopy: { color: '#8A6F64', fontSize: 11, lineHeight: 16, marginTop: 5 },
  chatFab: { position: 'absolute', right: 22, bottom: 22, width: 58, height: 58, borderRadius: 29, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center', shadowColor: C.coral, shadowOpacity: 0.38, shadowRadius: 13, shadowOffset: { width: 0, height: 7 }, elevation: 8 },
  chatFabPlus: { color: C.white, fontSize: 29, lineHeight: 31, fontWeight: '400', textAlign: 'center' },
  composerModal: { flex: 1, justifyContent: 'flex-start' },
  composerBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(40,35,33,0.34)' },
  composerSheet: { backgroundColor: '#F6F3EF', borderBottomLeftRadius: 30, borderBottomRightRadius: 30, paddingHorizontal: 22, paddingTop: 44, paddingBottom: 24, shadowColor: '#282321', shadowOpacity: 0.16, shadowRadius: 24, elevation: 12 },
  composerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  composerTitle: { color: C.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  composerSubtitle: { color: C.muted, fontSize: 11, marginTop: 5 },
  composerClose: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  composerCloseText: { color: C.muted, fontSize: 23, lineHeight: 25, fontWeight: '400' },
  bootScreen: { flex: 1, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center', gap: 18 },
  bootBrand: { color: C.white, fontSize: 28, fontWeight: '900' },
  failurePage: { flex: 1, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center', padding: 34 },
  failureTitle: { color: C.white, fontSize: 28, lineHeight: 32, fontWeight: '900', textAlign: 'center', marginTop: 24 },
  failureCopy: { color: C.white, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 12 },
  failureHint: { color: C.white, fontSize: 12, lineHeight: 18, opacity: 0.78, textAlign: 'center', marginTop: 18 },
  page: { flexGrow: 1, paddingHorizontal: 22, paddingVertical: 18, gap: 18 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  brand: { color: C.coral, fontSize: 27, fontWeight: '700', letterSpacing: -1.5 },
  handle: { color: C.muted, fontSize: 12, fontWeight: '600' },
  welcome: { flex: 1, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center', gap: 6 },
  originalLogo: { width: 300, height: 300, marginVertical: -82 },
  welcomeBrand: { color: C.white, fontSize: 34, fontWeight: '900', letterSpacing: -1.2 },
  welcomeTag: { color: C.white, fontSize: 14, fontWeight: '700', opacity: 0.92 },
  tap: { color: C.white, position: 'absolute', bottom: 56, fontSize: 12, fontWeight: '700', opacity: 0.75 },
  authKeyboard: { flex: 1 },
  authScroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 30, paddingBottom: 28, gap: 28 },
  authHeader: { gap: 22 },
  authWrap: { flex: 1, padding: 28, justifyContent: 'space-between', paddingVertical: 60 },
  onboardingPage: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 8, paddingBottom: 42, gap: 26 },
  onboardingHeading: { marginTop: 2 },
  title: { color: C.ink, fontSize: 29, lineHeight: 34, fontWeight: '700', letterSpacing: -0.8 },
  subtitle: { color: C.muted, fontSize: 15, lineHeight: 22, marginTop: 9 },
  form: { gap: 14 },
  choiceLabel: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 38, paddingHorizontal: 13, borderRadius: 19, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  choiceOn: { backgroundColor: C.coral, borderColor: C.coral },
  choiceText: { color: C.muted, fontSize: 12, fontWeight: '600' },
  choiceTextOn: { color: C.white },
  preferenceGroup: { gap: 7, marginTop: 5 },
  nextPreferenceGroup: { marginTop: 6 },
  profileChoiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  profileChoice: { width: '48.7%', minHeight: 46, paddingHorizontal: 13, borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileChoiceOn: { backgroundColor: '#FFF0EA', borderColor: C.coral },
  profileChoiceText: { color: C.ink, fontSize: 12, fontWeight: '600' },
  profileChoiceTextOn: { color: C.coralDeep },
  choiceIndicator: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  choiceIndicatorOn: { backgroundColor: C.coral, borderColor: C.coral },
  choiceCheck: { color: C.white, fontSize: 12, fontWeight: '900', lineHeight: 15 },
  input: { height: 58, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 18, paddingHorizontal: 18, fontSize: 16, color: C.ink },
  legal: { color: C.muted, fontSize: 12, lineHeight: 18 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: C.coral, borderColor: C.coral },
  checkmark: { color: C.white, fontWeight: '900' },
  legalLink: { color: C.coralDeep, textDecorationLine: 'underline', fontWeight: '800' },
  legalDocumentLink: { color: C.coralDeep, fontSize: 12, fontWeight: '700', textAlign: 'center', textDecorationLine: 'underline', paddingVertical: 2 },
  errorText: { color: '#B63838', fontSize: 12, fontWeight: '700' },
  verificationNote: { backgroundColor: '#F7E8E1', borderRadius: 18, padding: 15 },
  verificationTitle: { color: C.ink, fontSize: 13, fontWeight: '900', marginBottom: 5 },
  primary: { height: 54, borderRadius: 28, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: C.white, fontWeight: '700', fontSize: 13, letterSpacing: 0.4 },
  switchText: { color: C.coralDeep, fontWeight: '700', textAlign: 'center', padding: 8 },
  forgotText: { color: C.muted, fontSize: 12, textAlign: 'center', padding: 6, textDecorationLine: 'underline' },
  pill: { alignSelf: 'flex-start', minWidth: 112, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: C.white, borderRadius: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  smallCard: { flex: 1, minHeight: 100, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, padding: 14 },
  recentCard: { minHeight: 92, borderRadius: 24, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, padding: 14, flexDirection: 'row', alignItems: 'center' },
  recentContent: { flex: 1, paddingHorizontal: 12 },
  cardArrow: { color: C.muted, fontSize: 27, marginLeft: 7 },
  cardTitle: { color: C.ink, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  cardCopy: { color: C.muted, fontSize: 13, lineHeight: 18 },
  section: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: C.ink, marginTop: 4 },
  emptyEvent: { minHeight: 142, borderRadius: 22, backgroundColor: '#F7E8E1', padding: 20, alignItems: 'center', justifyContent: 'center' },
  eventTitle: { color: C.ink, fontSize: 15, fontWeight: '700', marginTop: 4 },
  eventCopy: { color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 6, maxWidth: 280 },
  safety: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 'auto' },
  darkPage: { flex: 1, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 22, gap: 9 },
  outfitHeading: { alignItems: 'center', paddingHorizontal: 22, marginBottom: 4 },
  outfitEyebrow: { color: C.coralDeep, fontSize: 9, fontWeight: '700', letterSpacing: 1.7, marginBottom: 6 },
  outfitTitle: { color: '#24201E', fontSize: 25, fontWeight: '700', letterSpacing: -0.8, textAlign: 'center' },
  outfitSubtitle: { color: '#92857E', fontSize: 12, lineHeight: 18, marginTop: 5, textAlign: 'center' },
  photoBox: { width: '68%', aspectRatio: 9 / 16, maxHeight: 390, alignSelf: 'center', borderRadius: 24, borderWidth: 1, borderColor: '#E8DDD7', backgroundColor: '#FFFDFC', alignItems: 'center', justifyContent: 'center', marginTop: 3, marginBottom: 4, overflow: 'hidden' },
  photoFilled: { backgroundColor: '#BC8D78', borderStyle: 'solid', borderColor: C.coral },
  outfitImage: { width: '100%', height: '100%', borderRadius: 22 },
  storyEmpty: { alignItems: 'center', padding: 18 },
  storyAdd: { width: 58, height: 58, borderRadius: 29, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center', marginBottom: 14, shadowColor: C.coral, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4 },
  storyAddText: { color: C.white, fontSize: 31, lineHeight: 35, fontWeight: '300' },
  storyHint: { color: '#A89B94', fontSize: 10, marginTop: 7, textAlign: 'center' },
  outfitActions: { width: '68%', alignSelf: 'center', gap: 8 },
  storyTools: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  cameraButton: { width: '100%', height: 44, borderRadius: 16, backgroundColor: C.white, borderWidth: 1, borderColor: '#E9E1DC', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  cameraButtonPrimary: { backgroundColor: C.coral, borderColor: C.coral, shadowColor: C.coral, shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  cameraButtonIcon: { color: C.coralDeep, fontSize: 18, lineHeight: 19, includeFontPadding: false },
  cameraButtonText: { color: '#756963', fontSize: 12, lineHeight: 16, fontWeight: '600', includeFontPadding: false },
  cameraButtonTextPrimary: { color: C.white },
  storyTool: { alignItems: 'center', minWidth: 68, gap: 7, paddingVertical: 3 },
  storyToolIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', color: C.coralDeep, borderWidth: 1, borderColor: '#E9E1DC', textAlign: 'center', textAlignVertical: 'center', fontSize: 20, lineHeight: 36, includeFontPadding: false },
  storyToolText: { color: '#756963', fontSize: 9, fontWeight: '500', letterSpacing: 0.15 },
  storySave: { width: '100%', height: 44, borderRadius: 16, alignSelf: 'center', marginTop: 0, shadowOpacity: 0.22 },
  storySaveText: { color: C.white, fontSize: 12, lineHeight: 16, fontWeight: '600', includeFontPadding: false },
  noPhoto: { color: '#756963', fontWeight: '600', marginTop: 12 },
  person: { color: '#FFF3E8', fontSize: 130, opacity: 0.9 },
  photoHint: { color: C.white, fontWeight: '800' },
  whiteButton: { height: 54, borderRadius: 28, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  darkButtonText: { color: C.ink, fontWeight: '900', fontSize: 14 },
  darkSafety: { color: '#9A8E87', fontSize: 11, textAlign: 'center' },
  recentTitle: { color: C.ink, fontSize: 21, fontWeight: '900', marginTop: 8 },
  recentSubtitle: { color: C.muted, fontSize: 13, marginTop: -10, marginBottom: 10 },
  encounterList: { gap: 14 },
  emptyState: { minHeight: 230, marginTop: 18, paddingHorizontal: 28, borderRadius: 24, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { color: C.ink, fontSize: 17, fontWeight: '800', marginTop: 8 },
  emptyCopy: { color: C.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  encounterRow: { height: 104, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 20, overflow: 'hidden', flexDirection: 'row' },
  outfitThumb: { width: 104, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: C.line },
  encounterImage: { width: '100%', height: '100%' },
  thumbMark: { color: C.white, fontSize: 54, opacity: 0.9 },
  encounterAction: { flex: 1, padding: 12, justifyContent: 'space-between' },
  encounterTime: { color: C.muted, fontSize: 12 },
  requestButton: { alignSelf: 'stretch', minHeight: 40, borderRadius: 22, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center' },
  requestedButton: { backgroundColor: '#B7B3B1' },
  requestText: { color: C.white, fontSize: 10, lineHeight: 11, textAlign: 'center', fontWeight: '600' },
  moreButton: { position: 'absolute', right: 8, top: 4, zIndex: 2, padding: 6 },
  moreText: { color: C.muted, fontSize: 12, fontWeight: '900' },
  settingsPage: { flexGrow: 1, padding: 18, paddingBottom: 48, gap: 16 },
  settingSection: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 15, gap: 9 },
  compactSettingSection: { gap: 8 },
  settingLabel: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  cityChoiceLabel: { marginTop: 0 },
  profileInput: { height: 46, borderRadius: 14, paddingHorizontal: 13, fontSize: 13 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#E8A64C' },
  statusVerified: { backgroundColor: '#46A866' },
  statusRejected: { backgroundColor: '#B63838' },
  statusTitle: { color: C.ink, fontSize: 14, fontWeight: '700', marginBottom: 3 },
  outlineButton: { minHeight: 50, borderRadius: 25, borderWidth: 1, borderColor: C.coral, alignItems: 'center', justifyContent: 'center' },
  profileAction: { minHeight: 40, height: 40, borderRadius: 20 },
  outlineText: { color: C.coralDeep, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  deleteText: { color: '#B63838', fontSize: 13, fontWeight: '800', textAlign: 'center', padding: 12 },
  successText: { color: '#367A4C', fontSize: 12, fontWeight: '700' },
  noticeText: { color: '#367A4C', backgroundColor: '#EAF5EE', borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  backText: { color: C.ink, fontSize: 32, width: 32 },
  headerSpacer: { width: 32 },
  plusCard: { minHeight: 66, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 11, backgroundColor: C.coral, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  plusTitle: { color: C.white, fontSize: 18, fontWeight: '900' },
  plusCopy: { color: C.white, fontSize: 11, opacity: 0.9, marginTop: 5, maxWidth: 245 },
  plusArrow: { color: C.white, fontSize: 32 },
  premiumPage: { flex: 1, backgroundColor: '#F6F3EF', padding: 22, justifyContent: 'center' },
  premiumBack: { position: 'absolute', left: 24, top: 48, padding: 8 },
  premiumBackText: { color: '#24201E', fontSize: 34 },
  offerCard: { backgroundColor: C.white, borderWidth: 1, borderColor: '#E9E1DC', borderRadius: 28, padding: 24, shadowColor: '#8F6B5D', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 3 },
  plusKicker: { color: C.coral, fontSize: 10, fontWeight: '700', letterSpacing: 1.8 },
  premiumTitle: { color: '#24201E', fontSize: 30, lineHeight: 34, fontWeight: '700', letterSpacing: -0.8, marginTop: 18 },
  premiumSubtitle: { color: '#92857E', fontSize: 13, lineHeight: 19, marginTop: 9 },
  benefits: { gap: 14, marginVertical: 25, backgroundColor: '#FFF8F4', borderRadius: 20, padding: 18 },
  benefit: { color: '#5F554F', fontSize: 13, fontWeight: '600' },
  restoreText: { color: C.coralDeep, textDecorationLine: 'underline', fontWeight: '600', textAlign: 'center', padding: 17 },
  premiumMessage: { color: '#5F554F', fontSize: 12, textAlign: 'center', fontWeight: '600' },
  premiumLegal: { color: '#9A8E87', fontSize: 10, textAlign: 'center', marginTop: 14 },
  matchRow: { minHeight: 78, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 14 },
  matchAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center' },
  matchUsername: { color: C.ink, fontSize: 16, fontWeight: '900', marginBottom: 4 },
  plusArrowDark: { color: C.muted, fontSize: 27, marginLeft: 'auto' },
  privacyBlock: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 16, flexDirection: 'row', gap: 13 },
  privacyNumber: { color: C.coral, fontSize: 13, fontWeight: '900' },
  privacyBody: { flex: 1, gap: 6 },
  privacyFooter: { color: C.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', padding: 12 },
  profileCard: { flex: 1, backgroundColor: C.white, borderRadius: 28, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  fakePhoto: { width: '100%', flex: 1, minHeight: 280, backgroundColor: '#C99B87', borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  distancePill: { marginTop: -15, backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18 },
  distanceText: { color: C.coralDeep, fontSize: 10, fontWeight: '900' },
  profilePrompt: { color: C.ink, fontSize: 17, fontWeight: '900', marginVertical: 14 },
  pass: { color: C.muted, fontWeight: '700', padding: 14 },
  matchPage: { flex: 1, backgroundColor: C.coral, paddingHorizontal: 30, paddingTop: 84, paddingBottom: 34, alignItems: 'center' },
  matchLogo: { width: 156, height: 156 },
  matchKicker: { color: C.white, fontSize: 11, fontWeight: '900', letterSpacing: 2, marginTop: 34 },
  matchTitle: { color: C.white, fontSize: 32, lineHeight: 34, fontWeight: '900', letterSpacing: -0.7, textAlign: 'center', marginTop: 15, paddingHorizontal: 18, width: '100%' },
  matchCopy: { color: C.white, fontSize: 16, lineHeight: 22, textAlign: 'center', maxWidth: 300, marginTop: 8 },
  handleReveal: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 24, width: '100%', padding: 20, alignItems: 'center', marginTop: 18 },
  revealLabel: { color: C.white, opacity: 0.8, fontSize: 10, fontWeight: '900' },
  revealHandle: { color: C.white, fontSize: 26, fontWeight: '900', marginTop: 6 },
  matchBack: { marginTop: 18, paddingHorizontal: 18, paddingVertical: 10 },
  matchBackText: { color: C.white, opacity: 0.78, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
  whiteButtonWide: { height: 56, borderRadius: 28, backgroundColor: C.white, width: '100%', alignItems: 'center', justifyContent: 'center' },
});
