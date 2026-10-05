import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  User,
  Lock,
  Sun,
  Moon,
  Zap,
  ShieldCheck,
  Activity,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { loginApi } from "@/services/auth";
import { markSignedIn, takeLogoutReason } from "@/lib/auth";
import { useTheme } from "@/context/ThemeContext";

// Credentials must be typed by hand: no paste, drop, copy, cut or right-click menu on the login fields.
const blockClipboard = (e: React.SyntheticEvent) => e.preventDefault();

export default function LoginPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capsLock, setCapsLock] = useState(false);
  // Why the user landed here (session ended), shown once above the form.
  const [logoutReason] = useState(() => takeLogoutReason());

  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const toggleVisibility = () => setIsVisible(!isVisible);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const session = await loginApi({ employee_id: email, password }); // the server sets the HttpOnly session cookie
      markSignedIn(session.idle_minutes, session.expires_in_minutes);
      setIsSuccess(true);
      setTimeout(() => navigate("/dashboard"), 800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="app-ambient relative min-h-screen w-full flex flex-col lg:flex-row items-stretch p-3.5 sm:p-5 transition-colors duration-300 overflow-x-hidden font-sans"
      style={{
        background:
          theme === "dark"
            ? "radial-gradient(ellipse 65% 45% at 20% 5%, rgba(14, 165, 233, 0.12), transparent 70%), radial-gradient(ellipse 55% 45% at 90% 90%, rgba(2, 132, 199, 0.08), transparent 70%), #070c1e"
            : "linear-gradient(135deg, #eef4fc 0%, #e2edfd 50%, #d8e7fa 100%)",
      }}
    >
      {/* ── Top-Right Theme Toggle ── */}
      <div className="absolute top-5 right-5 sm:top-6 sm:right-6 z-30">
        <button
          type="button"
          onClick={toggleTheme}
          title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-white/80 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 shadow-sm backdrop-blur-md transition-all hover:scale-105 cursor-pointer"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>
      </div>

      {/* ── Left Half: Full-height Hero Card ── */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full lg:w-[46%] xl:w-[47%] 2xl:w-[48%] rounded-[28px] sm:rounded-[34px] overflow-hidden bg-gradient-to-br from-[#00d2ff] via-[#0084ff] to-[#0052cc] shadow-[0_20px_50px_rgba(0,198,255,0.28)] dark:shadow-[0_24px_70px_rgba(0,114,255,0.38)] p-8 sm:p-11 xl:p-16 flex flex-col justify-between min-h-[580px] lg:min-h-[calc(100vh-2.5rem)] shrink-0"
      >
        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.18] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
            maskImage: "linear-gradient(to bottom right, black, transparent 70%)",
            WebkitMaskImage: "linear-gradient(to bottom right, black, transparent 70%)",
          }}
        />
        {/* Abstract Floating Circles */}
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/[0.08] pointer-events-none" />
        <div className="absolute top-1/3 -left-24 w-96 h-96 rounded-full bg-white/[0.05] pointer-events-none" />
        <div className="absolute -bottom-24 -right-16 w-96 h-96 rounded-full bg-white/[0.06] pointer-events-none" />

        {/* Top Brand Header */}
        <div className="relative z-10">
          <img
            src="/assets/logo.png"
            alt="PULSE"
            className="h-14 sm:h-16 w-auto object-contain brightness-0 invert"
          />
        </div>

        {/* Middle Content */}
        <div className="relative z-10 my-auto py-8 sm:py-10 space-y-6 sm:space-y-8 max-w-2xl w-full">
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl xl:text-[44px] font-extrabold text-white leading-[1.15] tracking-tight">
              Everything your team needs, <br className="hidden sm:inline" />
              unified in one place
            </h1>
            <p className="text-sm sm:text-base text-white/85 leading-relaxed max-w-xl font-normal">
              Streamline multi-stage workflows, role-based screen security, process lifecycles, and team collaboration on an enterprise-ready architecture.
            </p>
          </div>

          {/* Feature Pills */}
          <div className="space-y-3 pt-1 w-full">
            {[
              { Icon: Zap, text: "Intelligent Workflow & Pipeline Automation" },
              { Icon: ShieldCheck, text: "Zero-Trust Role & Permission Matrix" },
              { Icon: Activity, text: "Real-Time Monitoring & Comprehensive Audit Trails" },
            ].map(({ Icon, text }, i) => (
              <motion.div
                key={text}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.12, duration: 0.45, ease: "easeOut" }}
                className="group flex items-center gap-4 px-5 py-3.5 rounded-2xl bg-white/[0.12] hover:bg-white/[0.2] backdrop-blur-md border border-white/20 hover:border-white/35 transition-all shadow-sm w-full"
              >
                <div className="w-10 h-10 rounded-xl bg-white/15 group-hover:bg-white/25 flex items-center justify-center shrink-0 text-white shadow-inner transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-sm sm:text-[15px] font-semibold text-white tracking-wide">{text}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bottom Copyright */}
        <div className="relative z-10 pt-4">
          <p className="text-xs sm:text-sm text-white/75 font-normal">
            &copy; 2026 MTPL. All rights reserved.
          </p>
        </div>
      </motion.div>

      {/* ── Right Half: Centered Form Column ── */}
      <div className="flex-1 w-full lg:w-[54%] xl:w-[53%] 2xl:w-[52%] flex flex-col items-center justify-center p-4 sm:p-8 lg:p-12 my-auto">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-[440px] flex flex-col shrink-0"
        >
          <div className="glass-panel rounded-[28px] p-7 sm:p-10 transition-colors duration-200">
            <AnimatePresence mode="wait">
              {!isSuccess ? (
                <motion.div
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {/* Card Title & Subtitle */}
                  <div className="mb-7 text-center">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                      Welcome back
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      Sign in to continue to your workspace.
                    </p>
                  </div>

                  {logoutReason && (
                    <div
                      role="status"
                      className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                      <p>
                        {logoutReason === "idle"
                          ? "You were signed out because you were inactive for a while. Please sign in again."
                          : "Your session has expired. Please sign in again."}
                      </p>
                    </div>
                  )}

                  <form className="space-y-5" onSubmit={handleSubmit}>
                    {/* Username Field */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="email"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Username
                      </label>
                      <div className="relative flex items-center rounded-xl border border-slate-200 dark:border-white/10 glass-field hover:border-slate-300 px-3.5 py-3 focus-within:bg-white dark:focus-within:bg-white/[0.05] focus-within:border-[#0084ff] focus-within:ring-4 focus-within:ring-[#00c6ff]/15 transition-all">
                        <User className="w-4 h-4 text-slate-400 dark:text-slate-500 mr-3 shrink-0" />
                        <input
                          id="email"
                          type="text"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (error) setError(null);
                          }}
                          placeholder="Enter your username"
                          className="w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
                          required
                          autoFocus
                          onPaste={blockClipboard}
                          onDrop={blockClipboard}
                          onCopy={blockClipboard}
                          onCut={blockClipboard}
                          onContextMenu={blockClipboard}
                          autoComplete="username"
                          disabled={isLoading}
                        />
                      </div>
                    </div>

                    {/* Password Field */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="password"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Password
                      </label>
                      <div className="relative flex items-center rounded-xl border border-slate-200 dark:border-white/10 glass-field hover:border-slate-300 px-3.5 py-3 focus-within:bg-white dark:focus-within:bg-white/[0.05] focus-within:border-[#0084ff] focus-within:ring-4 focus-within:ring-[#00c6ff]/15 transition-all">
                        <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500 mr-3 shrink-0" />
                        <input
                          id="password"
                          type={isVisible ? "text" : "password"}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (error) setError(null);
                          }}
                          onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                          onBlur={() => setCapsLock(false)}
                          placeholder="Enter your password"
                          className="w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
                          required
                          onPaste={blockClipboard}
                          onDrop={blockClipboard}
                          onCopy={blockClipboard}
                          onCut={blockClipboard}
                          onContextMenu={blockClipboard}
                          autoComplete="current-password"
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={toggleVisibility}
                          className="text-slate-400 hover:text-[#0084ff] dark:hover:text-slate-200 ml-2 transition-colors cursor-pointer"
                          aria-label={isVisible ? "Hide password" : "Show password"}
                          title={isVisible ? "Hide password" : "Show password"}
                        >
                          {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {capsLock && (
                        <p className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          <AlertCircle className="w-3.5 h-3.5" /> Caps Lock is on
                        </p>
                      )}
                    </div>

                    {/* Error Banner */}
                    <AnimatePresence>
                      {error && (
                        <motion.div
                          role="alert"
                          initial={{ opacity: 0, height: 0, x: 0 }}
                          animate={{ opacity: 1, height: "auto", x: [0, -6, 6, -4, 4, 0] }}
                          exit={{ opacity: 0, height: 0 }}
                          className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3.5 py-2.5 text-xs text-red-600 dark:text-red-400 overflow-hidden"
                        >
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <p>{error}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="group w-full py-3 rounded-xl bg-gradient-to-r from-[#00c6ff] to-[#0072ff] hover:from-[#33d2ff] hover:to-[#1a80ff] text-white font-semibold text-sm shadow-[0_6px_20px_rgba(0,132,255,0.4)] transition-all hover:shadow-[0_8px_26px_rgba(0,132,255,0.55)] active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Signing in...
                        </>
                      ) : (
                        <>
                          Sign In
                          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                        </>
                      )}
                    </button>

                    {/* Helper text */}
                    <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                      Need access? Contact your administrator.
                    </p>
                  </form>
                </motion.div>
              ) : (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", bounce: 0.5 }}
                  className="flex flex-col items-center justify-center py-12 text-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
                    className="w-16 h-16 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mb-5 shadow-sm"
                  >
                    <CheckCircle2 className="w-9 h-9" />
                  </motion.div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1.5">
                    Welcome back!
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    You have successfully signed in.
                  </p>
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-3">
                    <Loader2 className="w-3 h-3 animate-spin" /> Redirecting to your dashboard...
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Under-Card Security Note */}
          <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 mt-4 font-normal">
            Protected by secure authentication. Never share your password.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
