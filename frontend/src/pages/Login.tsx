import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { showError } from "../lib/toast";
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
  ArrowRight,
  Loader2,
  Crop,
  Sparkles,
  Sliders,
} from "lucide-react";
import { loginApi } from "@/services/auth";
import { preloadRoute } from "@/lib/lazyPages";
import { clearLogoutReason, markSignedIn, peekLogoutReason } from "@/lib/auth";
import { useTheme } from "@/context/ThemeContext";
import { getAppBackground } from "@/lib/appBackground";
import Copyright from "@/components/Copyright";

// Credentials must be typed by hand: no paste, drop, copy, cut or right-click menu on the login fields.
const blockClipboard = (e: React.SyntheticEvent) => e.preventDefault();

export default function LoginPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  // Why the user landed here (session ended), shown once above the form.
  // Peek during render, clear once the page is really on screen: the first render can be discarded while
  // the page loads, and taking (removing) it there lost the message.
  const [logoutReason] = useState(() => peekLogoutReason());
  useEffect(() => clearLogoutReason(), []);

  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const toggleVisibility = () => setIsVisible(!isVisible);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Fetch the dashboard's code while the sign-in request is in flight, not after it.
    preloadRoute("/dashboard");
    try {
      const session = await loginApi({ employee_id: email, password }); // the server sets the HttpOnly session cookie
      markSignedIn(session.idle_minutes, session.expires_in_minutes);
      setIsSuccess(true);
      setTimeout(() => navigate("/dashboard"), 800);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="app-ambient login-pattern relative min-h-screen lg:h-screen w-full flex flex-col lg:flex-row items-center lg:items-stretch p-3 sm:p-4 lg:p-5 transition-colors duration-300 overflow-x-hidden overflow-y-auto lg:overflow-hidden no-scrollbar font-sans"
      style={getAppBackground(theme)}
    >
      {/* ── Top-Right Theme Toggle ── */}
      <div className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 z-30">
        <button
          type="button"
          onClick={toggleTheme}
          title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-white/80 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 shadow-sm backdrop-blur-md transition-all hover:scale-105 cursor-pointer"
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
        className="hidden lg:flex relative w-full lg:w-[46%] xl:w-[47%] 2xl:w-[48%] rounded-[20px] xl:rounded-[28px] overflow-hidden bg-gradient-to-br from-[#00d2ff] via-[#0084ff] to-[#0052cc] shadow-[0_20px_50px_rgba(0,198,255,0.28)] dark:shadow-[0_24px_70px_rgba(0,114,255,0.38)] p-5 lg:p-7 xl:p-9 2xl:p-12 flex-col justify-between h-full max-h-[calc(100vh-2rem)] shrink-0 select-none"
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
        <div className="relative z-10 flex items-center justify-between gap-3">
          <img
            src="/assets/logo.png"
            alt="PULSE"
            className="h-8 lg:h-9 xl:h-11 w-auto object-contain brightness-0 invert"
          />
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/20 backdrop-blur-md text-white text-[11px] font-semibold">
            <Crop className="w-3 h-3 text-sky-200" />
            <span>Bigbasket-Image Cropping Tool</span>
          </div>
        </div>

        {/* Middle Content */}
        <div className="relative z-10 my-auto py-3 xl:py-6 space-y-3.5 xl:space-y-6 max-w-xl w-full">
          <div className="space-y-2">
            <h1 className="text-xl lg:text-2xl xl:text-3xl 2xl:text-[34px] font-bold text-white leading-snug tracking-tight">
              Automated image cropping & <br className="hidden sm:inline" />
              standardization platform
            </h1>
            <p className="text-xs xl:text-[13px] text-white/85 leading-relaxed max-w-lg font-normal">
              AI-powered background removal, 2000×2000 canvas standardization, intelligent back-of-pack sub-region extraction, and reviewer sign-off for BigBasket cataloging.
            </p>
          </div>

          {/* Feature Pills */}
          <div className="space-y-2 pt-1 w-full">
            {[
              { Icon: Sparkles, text: "AI Background Removal & Photoroom Pipeline" },
              { Icon: Crop, text: "2000 × 2000 Square Canvas & 150 DPI Margins" },
              { Icon: Sliders, text: "Sub-Region Extraction & Interactive Review Studio" },
            ].map(({ Icon, text }, i) => (
              <motion.div
                key={text}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.12, duration: 0.45, ease: "easeOut" }}
                className="group flex items-center gap-3 px-3.5 py-2 xl:py-2.5 rounded-xl bg-white/[0.12] hover:bg-white/[0.2] backdrop-blur-md border border-white/20 hover:border-white/35 transition-all shadow-sm w-full"
              >
                <div className="w-7 h-7 xl:w-8 xl:h-8 rounded-lg bg-white/15 group-hover:bg-white/25 flex items-center justify-center shrink-0 text-white shadow-inner transition-colors">
                  <Icon className="w-3.5 h-3.5 xl:w-4 xl:h-4" />
                </div>
                <span className="text-xs xl:text-[13px] font-semibold text-white tracking-wide">{text}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bottom Copyright */}
        <div className="relative z-10 pt-2">
          <Copyright className="text-[11px] xl:text-xs text-white/75 font-normal" />
        </div>
      </motion.div>

      {/* ── Right Half: Centered Form Column ── */}
      <div className="flex-1 w-full lg:w-[54%] xl:w-[53%] 2xl:w-[52%] flex flex-col items-center justify-center p-3 sm:p-6 lg:p-8 xl:p-12 my-auto">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-[380px] sm:max-w-[430px] flex flex-col shrink-0"
        >
          {/* Mobile & Tablet Logo Header (< lg) */}
          <div className="lg:hidden flex flex-col items-center justify-center mb-6 pt-6 sm:pt-0 gap-2">
            <img
              src="/assets/logo.png"
              alt="PULSE"
              className="h-11 sm:h-13 w-auto object-contain dark:brightness-0 dark:invert"
            />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Bigbasket-Image Cropping Tool
            </span>
          </div>

          <div className="glass-panel rounded-[24px] sm:rounded-[28px] p-6 sm:p-8 lg:p-9 xl:p-10 transition-colors duration-200 shadow-xl">
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
                    <span className="inline-block text-[11px] font-semibold text-sky-600 dark:text-sky-400 mb-1.5">
                      Bigbasket-Image Cropping Tool
                    </span>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                      Welcome back
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                      Sign in to manage extraction batches and catalog assets.
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
                          : logoutReason === "replaced"
                            ? "You were signed out because your account was signed in on another browser or device."
                          : logoutReason === "url"
                            ? "You were signed out because the page address was changed manually. Please sign in again and use the menu to move between screens."
                          : logoutReason === "tabs"
                            ? "You were signed out because the app was opened in more than one tab. Please use a single tab."
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
                          onChange={(e) => setEmail(e.target.value)}
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
                          onChange={(e) => setPassword(e.target.value)}
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

          {/* Mobile Copyright (< lg) */}
          <div className="lg:hidden mt-6 text-center">
            <Copyright className="text-[11px] text-slate-400 dark:text-slate-500 font-normal" />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
