import React, { createContext, forwardRef, useContext, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import StudentScreenSkeleton from './StudentScreenSkeleton';
import { COLORS } from '../theme';

export const StudentRefreshContext = createContext(null);

// Only the scroll content is replaced: parent state and unsaved drafts survive.
const RefreshableScrollView = forwardRef(function RefreshableScrollView({ onRefresh, skeletonVariant, contentContainerStyle, children, ...props }, ref) {
  const context = useContext(StudentRefreshContext);
  const reload = onRefresh || context?.reload;
  const variant = skeletonVariant || context?.variant || 'dashboard';
  const [refreshing, setRefreshing] = useState(false);
  const lock = useRef(false);
  async function refresh() {
    if (!reload || lock.current) return;
    lock.current = true;
    setRefreshing(true);
    try { await reload(); }
    finally { lock.current = false; setRefreshing(false); }
  }
  return <ScrollView {...props} contentContainerStyle={{ flexGrow: 1 }} ref={ref} alwaysBounceVertical
    refreshControl={reload ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} colors={[COLORS.primary]} /> : undefined}>
    {refreshing && <View style={{ minHeight: 600 }}><StudentScreenSkeleton variant={variant} /></View>}
    <View style={[contentContainerStyle, refreshing && { display: 'none' }]}>{children}</View>
  </ScrollView>;
});
export default RefreshableScrollView;
