import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { PageLayout } from '@/components/layout/PageLayout'
import MobileHeader from '@/components/MobileHeader'
import { ChevronDown, ChevronUp, HelpCircle, MessageSquare, Settings, Shield, Users, Zap } from 'lucide-react'

interface FAQItem {
  id: string
  category: string
  question: string
  answer: string
  icon?: React.ReactNode
}

const faqData: FAQItem[] = [
  {
    id: '1',
    category: '帳號相關',
    question: '如何註冊新帳號？',
    answer: '您可以點擊右上角的「登入」按鈕，然後選擇「註冊新帳號」。填寫必要資訊後即可完成註冊。註冊後請檢查您的電子信箱以驗證帳號。',
    icon: <Users className="w-4 h-4" />
  },
  {
    id: '2',
    category: '帳號相關',
    question: '忘記密碼怎麼辦？',
    answer: '在登入頁面點擊「忘記密碼」連結，輸入您註冊時使用的電子信箱地址，系統會發送重設密碼的連結到您的信箱。',
    icon: <Users className="w-4 h-4" />
  },
  {
    id: '3',
    category: '技術支援',
    question: '如何建立支援工單？',
    answer: '進入支援頁面，點擊「尋求支援」按鈕。填寫問題描述、選擇分類和優先級後提交。我們會在 1-2 小時內回覆您的工單。',
    icon: <MessageSquare className="w-4 h-4" />
  },
  {
    id: '4',
    category: '技術支援',
    question: '支援工單的回覆時間？',
    answer: '我們的專業支援團隊提供 24/7 服務，平均回覆時間為 1-2 小時（工作日）。緊急問題會優先處理，通常在 30 分鐘內回覆。',
    icon: <MessageSquare className="w-4 h-4" />
  },
  {
    id: '5',
    category: '功能使用',
    question: '如何修改個人資料？',
    answer: '登入後點擊右上角的個人頭像，選擇「個人設定」。您可以在這裡修改顯示名稱、頭像、電子信箱等個人資訊。',
    icon: <Settings className="w-4 h-4" />
  },
  {
    id: '6',
    category: '功能使用',
    question: '如何啟用暗色主題？',
    answer: '在個人設定頁面中找到「外觀設定」選項，可以選擇淺色、暗色或跟隨系統主題。變更會立即生效。',
    icon: <Settings className="w-4 h-4" />
  },
  {
    id: '7',
    category: '隱私與安全',
    question: '我的個人資料是否安全？',
    answer: '我們非常重視用戶隱私和資料安全。所有個人資料都經過加密存儲，並嚴格遵守相關隱私法規。我們不會將您的資料分享給第三方。',
    icon: <Shield className="w-4 h-4" />
  },
  {
    id: '8',
    category: '隱私與安全',
    question: '如何啟用兩步驗證？',
    answer: '在個人設定的「安全性」選項中，您可以啟用兩步驗證。支援使用驗證器應用程式或簡訊驗證碼來增強帳號安全性。',
    icon: <Shield className="w-4 h-4" />
  },
  {
    id: '9',
    category: '常見問題',
    question: '網站支援哪些瀏覽器？',
    answer: '我們支援所有主流現代瀏覽器，包括 Chrome、Firefox、Safari、Edge 等。建議使用最新版本的瀏覽器以獲得最佳體驗。',
    icon: <Zap className="w-4 h-4" />
  },
  {
    id: '10',
    category: '常見問題',
    question: '移動設備是否支援？',
    answer: '是的！我們的網站採用響應式設計，完全支援手機和平板電腦瀏覽。您也可以將網站添加到主畫面，獲得類似 APP 的使用體驗。',
    icon: <Zap className="w-4 h-4" />
  }
]

const categories = Array.from(new Set(faqData.map(item => item.category)))

export default function FAQPage() {
  const { pathname } = useLocation()
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [selectedCategory, setSelectedCategory] = useState<string>('全部')

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedItems(newExpanded)
  }

  const filteredFAQs = selectedCategory === '全部' 
    ? faqData 
    : faqData.filter(item => item.category === selectedCategory)

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case '帳號相關': return <Users className="w-4 h-4" />
      case '技術支援': return <MessageSquare className="w-4 h-4" />
      case '功能使用': return <Settings className="w-4 h-4" />
      case '隱私與安全': return <Shield className="w-4 h-4" />
      case '常見問題': return <Zap className="w-4 h-4" />
      default: return <HelpCircle className="w-4 h-4" />
    }
  }

  return (
    <PageLayout pathname={pathname} maxWidth="max-w-4xl">
      <MobileHeader subtitle="FAQ" />
      <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold dual-text">常見問題</h1>
          </div>
          <p className="text-muted">
            查找常見問題的解答，如果找不到您需要的資訊，歡迎聯絡我們的支援團隊
          </p>
        </div>

        {/* Category Filter */}
        <div className="p-6 border-b border-border bg-surface/50">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('全部')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === '全部'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface-hover hover:bg-surface-hover text-muted hover:text-fg'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              全部
            </button>
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface-hover hover:bg-surface-hover text-muted hover:text-fg'
                }`}
              >
                {getCategoryIcon(category)}
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* FAQ List */}
        <div className="divide-y divide-border">
          {filteredFAQs.map((faq) => (
            <div key={faq.id} className="group">
              <button
                onClick={() => toggleExpanded(faq.id)}
                className="w-full p-6 text-left hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="text-primary mt-0.5">
                      {faq.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted bg-surface-hover px-2 py-1 rounded">
                          {faq.category}
                        </span>
                      </div>
                      <h3 className="font-medium dual-text group-hover:text-primary transition-colors">
                        {faq.question}
                      </h3>
                    </div>
                  </div>
                  <div className="text-muted group-hover:text-primary transition-colors">
                    {expandedItems.has(faq.id) ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </div>
                </div>
              </button>
              
              {expandedItems.has(faq.id) && (
                <div className="px-6 pb-6">
                  <div className="ml-7 p-4 bg-surface/50 rounded-lg border border-border">
                    <p className="text-muted leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border bg-surface/50 text-center">
          <p className="text-muted mb-4">
            找不到您需要的答案？
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button 
              onClick={() => window.location.href = '/support'}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors"
            >
              聯絡技術支援
            </button>
            <button 
              onClick={() => window.location.href = '/support/track'}
              className="px-6 py-2 bg-surface-hover text-fg rounded-lg hover:bg-surface transition-colors"
            >
              追蹤現有工單
            </button>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
