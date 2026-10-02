// screens/AdminDashboard.js
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { signOut } from 'firebase/auth';
import { collection, getCountFromServer } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { COLORS, SHADOWS, RADIUS } from '../theme';
import {
  UserIcon,
  BuildingIcon,
  FileIcon,
  TasksIcon,
  ChevronRightIcon,
  LogOutIcon,
} from '../components/Icons';

export default function AdminDashboard({ navigation }) {
  const [counts, setCounts] = useState({ users: 0, companies: 0, students: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [users, companies, students] = await Promise.all([
          getCountFromServer(collection(db, 'users')),
          getCountFromServer(collection(db, 'companies')),
          getCountFromServer(collection(db, 'students')),
        ]);
        setCounts({
          users: users.data().count,
          companies: companies.data().count,
          students: students.data().count,
        });
      } catch (e) {
        console.error('Count fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchCounts();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const cards = [
    {
      label: 'Manage Users',
      sub: 'Create & manage accounts and roles',
      screen: 'ManageUsers',
      color: COLORS.secondary,
      Icon: UserIcon,
    },
    {
      label: 'Manage Companies',
      sub: 'Partner directories & placement slots',
      screen: 'ManageCompanies',
      color: COLORS.success,
      Icon: BuildingIcon,
    },
    {
      label: 'View Students',
      sub: 'Monitor pre-deployment & OJT hours',
      screen: 'ViewStudents',
      color: '#7C3AED',
      Icon: TasksIcon,
    },
    {
      label: 'Reports & Analytics',
      sub: 'Evaluations, summaries & logs',
      screen: 'Reports',
      color: COLORS.accent,
      Icon: FileIcon,
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <View style={styles.badgeRow}>
            <View style={styles.adminTag}>
              <Text style={styles.adminTagText}>ADMINISTRATION</Text>
            </View>
          </View>
          <Text style={styles.greeting}>PATHWAY Console</Text>
          <Text style={styles.subGreeting}>UC Lapu-Lapu & Mandaue</Text>
        </View>

        <TouchableOpacity
          onPress={handleLogout}
          style={styles.logoutBtn}
          activeOpacity={0.75}
          accessibilityLabel="Log out"
        >
          <LogOutIcon size={16} color="#FFFFFF" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Stats Row */}
        <View style={styles.statsCard}>
          <Text style={styles.statsHeader}>SYSTEM OVERVIEW</Text>
          <View style={styles.statsRow}>
            {loading ? (
              <ActivityIndicator color={COLORS.secondary} size="small" />
            ) : (
              <>
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{counts.users}</Text>
                  <Text style={styles.statLabel}>Total Users</Text>
                </View>

                <View style={styles.statDivider} />

                <View style={styles.stat}>
                  <Text style={[styles.statNum, { color: COLORS.secondary }]}>
                    {counts.companies}
                  </Text>
                  <Text style={styles.statLabel}>Companies</Text>
                </View>

                <View style={styles.statDivider} />

                <View style={styles.stat}>
                  <Text style={[styles.statNum, { color: COLORS.success }]}>
                    {counts.students}
                  </Text>
                  <Text style={styles.statLabel}>Students</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Quick Actions Navigation Cards */}
        <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
        {cards.map(card => (
          <TouchableOpacity
            key={card.screen}
            style={styles.card}
            onPress={() => navigation.navigate(card.screen)}
            activeOpacity={0.85}
          >
            <View style={[styles.cardIconBox, { backgroundColor: `${card.color}18` }]}>
              <card.Icon size={22} color={card.color} />
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.cardLabel}>{card.label}</Text>
              <Text style={styles.cardSub}>{card.sub}</Text>
            </View>

            <ChevronRightIcon size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primaryDark,
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerTitleGroup: {
    flex: 1,
  },
  badgeRow: {
    marginBottom: 4,
  },
  adminTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.xs,
  },
  adminTagText: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  subGreeting: {
    fontSize: 12,
    color: '#93C5FD',
    marginTop: 2,
    fontWeight: '500',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  scroll: {
    padding: 18,
    paddingBottom: 40,
  },
  statsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  statsHeader: {
    fontSize: 10.5,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 4,
  },
  stat: {
    alignItems: 'center',
  },
  statNum: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.primaryDark,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 3,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.borderLight,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.soft,
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardBody: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  cardSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
