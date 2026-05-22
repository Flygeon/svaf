---
title: 新版Win11远程桌面/RDP突然连不上？！百分百教你解决！
published: 2026-05-22
description: 今天手头突然要用一个老的Win7 32位系统来远程开发，自然是无法用UU远程了，然后RDP又给我整这出...
image: img/fkms.png
draft: false
---
# 症状

一个带有远程桌面的版本（非家庭版），最新版Win11（25h2），启用了远程桌面服务

![](img/index.png)

![](img/index-1.png)

表现为：**RDP服务正常**，**本地连接正常**

但是系统 **不监听3389端口**，**外部无法连接** （我还排查了好久是不是我STUN的问题😅）

# 解决方案

> 由于新版Win11更”安全“了。微软默认将RDP隔离出去了，我们需要做以下几件事让RDP恢复外部监听😅

**使用管理员权限打开Powershell并执行** 

关闭Hypervisor

```powershell
bcdedit /set hypervisorlaunchtype off
```

关闭 Credential Guard

```powershell
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Lsa" /v LsaCfgFlags /t REG_DWORD /d 0 /f
```

同步微软账户密码至本地账户（如果需要）

```powershell
runas /u:MicrosoftAccount\<你的微软账户邮箱 > winver
```

重启系统即可

另外记得**不要打开** `要求设备使用网络级别身份验证连接(推荐)`

![](img/index-2.png)

# 鸣谢

[[实战记录] Windows 11 远程桌面已开启，但 3389 端口无监听？终极排查与修复 - 技术栈](https://jishuzhan.net/article/2054187012247785474)
[使用微软账号的Windows如何用远程桌面连接 - 知乎](https://zhuanlan.zhihu.com/p/561164150)