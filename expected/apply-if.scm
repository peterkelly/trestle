(letrec
    ((succ1
        (lambda (v0)
            (* v0 2 SUCC))))
    (if "cond"
        (succ1 "true")
        (succ1 "false")))
